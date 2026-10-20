package com.cc.englishquest.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.common.PdfOcr;
import com.cc.englishquest.common.PdfText;
import com.cc.englishquest.common.SheetReader;
import com.cc.englishquest.entity.GrammarLesson;
import com.cc.englishquest.entity.GrammarQuestion;
import com.cc.englishquest.mapper.GrammarLessonMapper;
import com.cc.englishquest.mapper.GrammarQuestionMapper;
import com.cc.englishquest.vo.GrammarImportVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * 语法题库批量导入。
 *
 * <p>与词汇导入同源（文件读取/解码共用 {@link SheetReader}），但有三处**刻意不同**：</p>
 *
 * <ol>
 *   <li><b>选项必须填全 A~D，不做自动生成。</b>词汇的干扰项只是"另一个中文释义"，
 *       随便借都还能看；语法选项必须能填进题干的空格（{@code women teachers} 这类
 *       形态变化），从别的题借选项会拼出明显不通的题 —— 那比让管理员多填三格糟得多。</li>
 *   <li><b>一行可以指定自己的 Day（支持一次导入多天）。</b>「天数」列留空则落到
 *       对话框里选中的那个 Day。值既可以是 Day 序号（{@code 3} / {@code Day 3} /
 *       {@code 第3天}），也可以直接写讲义标题。</li>
 *   <li><b>知识点可留空</b>，留空时按该 Day 的讲义标题补全 —— 题库现有数据里
 *       {@code knowledge_point} 就是讲义标题，保持一致才不会出现两种口径。</li>
 * </ol>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class GrammarImportService {

    /** 解析留空时补的通用说明（题库现有解析都是手写的具体讲解，这里只做兜底，不假装很懂） */
    private static final String ANALYSIS_TPL = "本题考查「%s」，注意题干中的关键信息与语法搭配。";

    /** 语法测验全部是单选题（表里虽然留了 FILL 枚举，但题库与前端都只用 CHOICE） */
    private static final String TYPE_CHOICE = "CHOICE";
    private static final Set<String> TYPE_CHOICE_ALIAS = Set.of(
            "choice", "单选", "单选题", "选择题", "单项选择", "选择", "英译中");

    private static final Map<String, String> HEADER_ALIAS = new LinkedHashMap<>();

    /** 必需列：内部字段名 -> 给人看的列名（顺序即提示语里的顺序） */
    private static final Map<String, String> REQUIRED_COLS = new LinkedHashMap<>();

    private static final String OPTIONAL_HINT = "（可选列：天数、知识点、解析、题型）";

    static {
        alias("stem", "stem");
        alias("题干", "stem");
        alias("题目", "stem");
        alias("问题", "stem");

        alias("optiona", "optionA");
        alias("选项a", "optionA");
        alias("a", "optionA");
        alias("optionb", "optionB");
        alias("选项b", "optionB");
        alias("b", "optionB");
        alias("optionc", "optionC");
        alias("选项c", "optionC");
        alias("c", "optionC");
        alias("optiond", "optionD");
        alias("选项d", "optionD");
        alias("d", "optionD");

        alias("answer", "answer");
        alias("正确答案", "answer");
        alias("答案", "answer");

        alias("day", "day");
        alias("dayno", "day");
        alias("天数", "day");
        alias("所属天数", "day");
        alias("讲义", "day");

        alias("knowledgepoint", "knowledgePoint");
        alias("知识点", "knowledgePoint");
        alias("考点", "knowledgePoint");
        alias("所属考点", "knowledgePoint");

        alias("analysis", "analysis");
        alias("解析", "analysis");
        alias("讲解", "analysis");

        alias("type", "type");
        alias("题型", "type");

        REQUIRED_COLS.put("stem", "题干");
        REQUIRED_COLS.put("optionA", "选项A");
        REQUIRED_COLS.put("optionB", "选项B");
        REQUIRED_COLS.put("optionC", "选项C");
        REQUIRED_COLS.put("optionD", "选项D");
        REQUIRED_COLS.put("answer", "正确答案");
    }

    private static void alias(String key, String field) {
        HEADER_ALIAS.put(key, field);
    }

    private final GrammarQuestionMapper grammarQuestionMapper;
    private final GrammarLessonMapper grammarLessonMapper;
    private final GrammarAiAnswerer aiAnswerer;

    /** OCR 词库目录（扫描件才用得到） */
    @Value("${app.ocr.datapath:tessdata}")
    private String ocrDatapath;

    /** 识别语言：中英混排的题库要两个都装 */
    @Value("${app.ocr.lang:chi_sim+eng}")
    private String ocrLang;

    /** 渲染精度：150~200 够用，再高只变慢 */
    @Value("${app.ocr.dpi:180}")
    private int ocrDpi;

    /** 单次最多识别多少页（一页 1~2 秒，防请求超时） */
    @Value("${app.ocr.max-pages:40}")
    private int ocrMaxPages;

    private PdfOcr.Options ocrOptions() {
        return new PdfOcr.Options(ocrDatapath, ocrLang, ocrDpi, ocrMaxPages);
    }

    private static byte[] readBytes(MultipartFile file) {
        try {
            return file.getBytes();
        } catch (IOException e) {
            throw BizException.badRequest("读取上传文件失败，请重新选择文件");
        }
    }

    /** 只解析不写库，给管理员核对 */
    public GrammarImportVO preview(MultipartFile file, Long lessonId) {
        return run(file, lessonId, true);
    }

    /** 真正导入 */
    @Transactional(rollbackFor = Exception.class)
    public GrammarImportVO doImport(MultipartFile file, Long lessonId) {
        return run(file, lessonId, false);
    }

    // ================================================================= 主流程

    private GrammarImportVO run(MultipartFile file, Long lessonId, boolean dryRun) {
        if (lessonId == null) {
            throw BizException.badRequest("请先选择默认要导入到哪一天（Day）");
        }
        GrammarLesson defaultLesson = grammarLessonMapper.selectById(lessonId);
        if (defaultLesson == null) {
            throw BizException.badRequest("目标 Day 不存在，请刷新后重试");
        }
        if (file == null || file.isEmpty()) {
            throw BizException.badRequest("请选择要导入的文件");
        }

        GrammarImportVO vo = new GrammarImportVO();
        vo.setDryRun(dryRun);

        // 读取文件：PDF 单独走解析，其余交给 SheetReader。
        // 为什么不能直接丢给 SheetReader：它的兜底分支会按文本去解二进制流，
        // 结果是一堆乱码行，校验阶段只会报「表头找不到列」，管理员完全看不出真正原因。
        byte[] bytes = readBytes(file);
        List<List<String>> grid;
        if (PdfText.isPdf(bytes)) {
            GrammarPdfParser.Result pdf = GrammarPdfParser.parse(bytes, ocrOptions());
            grid = pdf.grid();
            StringBuilder tip = new StringBuilder(pdf.tip());
            if (pdf.missingAnswer() > 0) {
                // 扫描件只印了题目、没印答案：让模型做一遍，做完留在预览里给人抽查
                int answered = aiAnswerer.fill(grid);
                tip.append(" 已用 AI 作答 ").append(answered).append(" 道，")
                        .append("入库前请抽查几道（AI 答案可能有错，错了会直接影响错题本）");
            }
            vo.setTip(tip.toString());
        } else {
            grid = SheetReader.read(file);
        }

        // --- 表头 ---
        int headerIdx = SheetReader.firstNonBlankRow(grid);
        if (headerIdx < 0) {
            throw BizException.badRequest("文件里没有找到任何内容");
        }
        Map<String, Integer> col = SheetReader.mapHeader(grid.get(headerIdx), HEADER_ALIAS, REQUIRED_COLS, OPTIONAL_HINT);

        // --- 数据行 ---
        List<Object[]> raw = new ArrayList<>();  // {rowNo, dayCell, stem, a, b, c, d, ans, kp, ana, typeCell}
        for (int i = headerIdx + 1; i < grid.size(); i++) {
            List<String> cells = grid.get(i);
            String stem = SheetReader.cell(cells, col.get("stem"));
            if (stem.isBlank() && SheetReader.isRowBlank(cells)) {
                continue;   // 整行空白：Excel 尾部常见，不算数据行
            }
            raw.add(new Object[]{
                    i + 1, SheetReader.cell(cells, col.get("day")), stem,
                    SheetReader.cell(cells, col.get("optionA")), SheetReader.cell(cells, col.get("optionB")),
                    SheetReader.cell(cells, col.get("optionC")), SheetReader.cell(cells, col.get("optionD")),
                    SheetReader.cell(cells, col.get("answer")),
                    SheetReader.cell(cells, col.get("knowledgePoint")),
                    SheetReader.cell(cells, col.get("analysis")),
                    SheetReader.cell(cells, col.get("type"))
            });
        }

        if (raw.isEmpty()) {
            throw BizException.badRequest("文件里只有表头，没有可导入的数据行");
        }
        if (raw.size() > SheetReader.MAX_ROWS) {
            throw BizException.badRequest("单次最多导入 " + SheetReader.MAX_ROWS + " 行，当前 " + raw.size()
                    + " 行，请拆分后分批导入");
        }
        vo.setTotal(raw.size());

        // --- Day 索引：按序号 + 按标题（归一化后）都能查 ---
        List<GrammarLesson> lessons = grammarLessonMapper.selectList(
                new LambdaQueryWrapper<GrammarLesson>().orderByAsc(GrammarLesson::getDayNo));
        Map<Integer, GrammarLesson> byDayNo = new LinkedHashMap<>();
        Map<String, GrammarLesson> byTitle = new LinkedHashMap<>();
        for (GrammarLesson l : lessons) {
            if (l.getDayNo() != null) {
                byDayNo.put(l.getDayNo(), l);
            }
            if (l.getTitle() != null && !l.getTitle().isBlank()) {
                byTitle.putIfAbsent(SheetReader.normKey(l.getTitle()), l);
            }
        }

        // --- 已存在的题干（按 Day 分组），用于去重；只取 lessonId + stem 两列 ---
        Set<String> existing = new LinkedHashSet<>();
        for (GrammarQuestion old : grammarQuestionMapper.selectList(
                new LambdaQueryWrapper<GrammarQuestion>()
                        .select(GrammarQuestion::getLessonId, GrammarQuestion::getStem))) {
            existing.add(dedupKey(old.getLessonId(), old.getStem()));
        }
        Set<String> seenInFile = new LinkedHashSet<>();

        List<GrammarQuestion> pending = new ArrayList<>();
        List<GrammarImportVO.Row> previewRows = new ArrayList<>();
        Set<Integer> touchedDays = new LinkedHashSet<>();

        for (Object[] r : raw) {
            int rowNo = (int) r[0];
            String dayCell = ((String) r[1]).trim();
            String stem = ((String) r[2]).trim();
            String oa = ((String) r[3]).trim();
            String ob = ((String) r[4]).trim();
            String oc = ((String) r[5]).trim();
            String od = ((String) r[6]).trim();
            String ansCell = ((String) r[7]).trim();
            String kp = ((String) r[8]).trim();
            String analysis = ((String) r[9]).trim();
            String typeCell = ((String) r[10]).trim();

            // 1) 所属 Day
            GrammarLesson lesson = defaultLesson;
            if (!dayCell.isEmpty()) {
                lesson = resolveLesson(dayCell, byDayNo, byTitle);
                if (lesson == null) {
                    vo.getErrors().add(new GrammarImportVO.RowError(rowNo,
                            "「天数」列的「" + dayCell + "」找不到对应的 Day，"
                                    + "可填 Day 序号（如 3 / Day 3 / 第3天）或讲义标题（如 形容词和副词）；"
                                    + "留空则导入到所选的那一天"));
                    continue;
                }
            }

            // 2) 必填与格式
            if (stem.isEmpty()) {
                vo.getErrors().add(new GrammarImportVO.RowError(rowNo, "「题干」列是空的"));
                continue;
            }
            List<String> missing = new ArrayList<>();
            if (oa.isEmpty()) {
                missing.add("A");
            }
            if (ob.isEmpty()) {
                missing.add("B");
            }
            if (oc.isEmpty()) {
                missing.add("C");
            }
            if (od.isEmpty()) {
                missing.add("D");
            }
            if (!missing.isEmpty()) {
                vo.getErrors().add(new GrammarImportVO.RowError(rowNo,
                        "选项 " + String.join("、", missing) + " 没有填：语法题的 4 个选项必须全部填写，"
                                + "系统不会自动生成（干扰项必须能和题干空格搭配，自动拼出来的题不能用）"));
                continue;
            }
            String ans = ansCell.toUpperCase(Locale.ROOT);
            if (ans.isEmpty()) {
                vo.getErrors().add(new GrammarImportVO.RowError(rowNo, "「正确答案」列是空的，请填 A/B/C/D"));
                continue;
            }
            if (!ans.matches("[ABCD]")) {
                vo.getErrors().add(new GrammarImportVO.RowError(rowNo,
                        "「正确答案」只能是 A/B/C/D，当前是「" + ansCell + "」"));
                continue;
            }

            String type = TYPE_CHOICE;
            if (!typeCell.isEmpty()) {
                if (!TYPE_CHOICE_ALIAS.contains(SheetReader.normHeader(typeCell))) {
                    vo.getErrors().add(new GrammarImportVO.RowError(rowNo,
                            "题型「" + typeCell + "」无法识别：语法测验目前只支持单选题，"
                                    + "该列留空即可（默认按单选处理）"));
                    continue;
                }
            }

            // 3) 知识点 / 解析的兜底
            StringBuilder note = new StringBuilder();
            if (dayCell.isEmpty()) {
                note.append("沿用所选 Day；");
            }
            if (kp.isEmpty()) {
                kp = lesson.getTitle() == null ? "" : lesson.getTitle().trim();
                if (!kp.isEmpty()) {
                    note.append("知识点按讲义标题补为「").append(kp).append("」；");
                }
            }
            boolean autoAnalysis = analysis.isEmpty();
            if (autoAnalysis) {
                analysis = ANALYSIS_TPL.formatted(kp.isEmpty() ? "本题" : kp);
                note.append("解析为系统兜底文案；");
            }

            // 4) 去重：同一天 + 同题干
            String key = dedupKey(lesson.getId(), stem);
            if (existing.contains(key)) {
                vo.getSkippedRows().add(new GrammarImportVO.RowError(rowNo,
                        "同一天（Day " + lesson.getDayNo() + "）里已经有这道题了，已跳过"));
                continue;
            }
            if (!seenInFile.add(key)) {
                vo.getSkippedRows().add(new GrammarImportVO.RowError(rowNo,
                        "这道题在文件里重复出现（同一天同一题干），只保留第一条"));
                continue;
            }

            GrammarImportVO.Row pr = new GrammarImportVO.Row();
            pr.setRowNo(rowNo);
            pr.setDayNo(lesson.getDayNo());
            pr.setLessonTitle(lesson.getTitle());
            pr.setType(type);
            pr.setStem(stem);
            pr.setOptionA(oa);
            pr.setOptionB(ob);
            pr.setOptionC(oc);
            pr.setOptionD(od);
            pr.setAnswer(ans);
            pr.setKnowledgePoint(kp);
            pr.setAnalysis(analysis);
            pr.setNote(note.length() == 0 ? null : note.toString().replaceAll("；$", ""));

            GrammarQuestion q = new GrammarQuestion();
            q.setLessonId(lesson.getId());
            q.setType(type);
            q.setStem(stem);
            q.setOptionA(oa);
            q.setOptionB(ob);
            q.setOptionC(oc);
            q.setOptionD(od);
            q.setAnswer(ans);
            q.setAnalysis(analysis);
            q.setKnowledgePoint(SheetReader.blankToNull(kp));
            q.setStatus(1);
            q.setCreateTime(LocalDateTime.now());
            pending.add(q);

            touchedDays.add(Math.toIntExact(lesson.getId()));
            if (previewRows.size() < SheetReader.PREVIEW_ROWS) {
                previewRows.add(pr);
            }
        }

        vo.setFailed(vo.getErrors().size());
        vo.setSkipped(vo.getSkippedRows().size());
        vo.setInsertable(pending.size());
        vo.setPreview(previewRows);
        vo.setLessonCount(touchedDays.size());

        if (!dryRun) {
            for (GrammarQuestion q : pending) {
                grammarQuestionMapper.insert(q);
            }
            vo.setInserted(pending.size());
            log.info("语法批量导入：涉及 {} 个 Day，成功 {} 条，跳过 {} 条，失败 {} 条",
                    touchedDays.size(), pending.size(), vo.getSkipped(), vo.getFailed());
        }
        return vo;
    }

    // ================================================================= 辅助

    /**
     * 把「天数」单元格解析成讲义。
     *
     * <p>三种写法都认：纯序号（{@code 3}）、带前缀的序号（{@code Day 3} / {@code day3} /
     * {@code 第3天} / {@code 第 3 天}）、以及讲义标题本身。</p>
     */
    private static GrammarLesson resolveLesson(String cell, Map<Integer, GrammarLesson> byDayNo,
                                              Map<String, GrammarLesson> byTitle) {
        String s = SheetReader.normHeader(cell);           // 去空白 + 小写 + 全角转半角
        String digits = s.replaceAll("[^0-9]", "");
        if (!digits.isEmpty() && digits.length() <= 3) {
            GrammarLesson byNo = byDayNo.get(Integer.parseInt(digits));
            if (byNo != null) {
                return byNo;
            }
        }
        return byTitle.get(SheetReader.normKey(cell));
    }

    /** 去重键：所属 Day + 题干（归一化后），保证"同一天里不重复题干" */
    private static String dedupKey(Long lessonId, String stem) {
        return lessonId + "|" + SheetReader.normKey(stem);
    }
}
