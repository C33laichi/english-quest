package com.cc.englishquest.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.common.PdfOcr;
import com.cc.englishquest.common.PdfText;
import com.cc.englishquest.common.SheetReader;
import com.cc.englishquest.entity.VocabLevel;
import com.cc.englishquest.entity.VocabQuestion;
import com.cc.englishquest.mapper.VocabLevelMapper;
import com.cc.englishquest.mapper.VocabQuestionMapper;
import com.cc.englishquest.vo.VocabImportVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Random;
import java.util.Set;

/**
 * 词汇题库批量导入。
 *
 * <p>做三件事：把上传的文件（.xlsx / .xls / .csv / .pdf）解析成行 → 逐行校验并补齐
 * 字段 → 去重后落库。表格文件的读取与解码走 {@link SheetReader}，
 * PDF（含扫描件）由 {@link VocabPdfParser} 还原成同样的表头 + 数据行，
 * 两条来源在这里汇成同一个 grid，后面的校验、去重、干扰项生成完全共用。</p>
 *
 * <p>核心设计取舍：</p>
 *
 * <ul>
 *   <li><b>表头必须写、但不挑格式。</b>认「单词 / 中文释义」等中文列名，
 *       大小写、全角半角、空格都容错；缺列直接报错而不是猜列序 ——
 *       猜错列序会静默写脏题库，比报错糟得多。</li>
 *   <li><b>选项可留空。</b>只填单词与释义时，系统从题库已有释义里挑 3 个
 *       当干扰项并随机决定正确项位置；填满 4 个选项时则以手填的为准。
 *       两种情况都支持，是为了让"快速录 500 个词"和"精细控制干扰项"
 *       不需要两张模板。<br>
 *       ★ 语法导入**刻意不提供**这个能力：词汇的干扰项只是"另一个中文释义"，
 *       随便借都还能看；语法选项必须能和题干空格搭配（women teachers 这种形态变化），
 *       从别的题借选项会拼出明显不通的题。</li>
 *   <li><b>重复按"同关卡 + 同单词"跳过</b>（不区分大小写），
 *       并把跳过原因回报给管理员，而不是静默忽略或直接覆盖。</li>
 * </ul>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class VocabImportService {

    /** 与手工新增题目保持一致的解析文案模板 */
    private static final String ANALYSIS_TPL = "%s 的中文释义是「%s」，注意与形近词、近义词区分。";

    private static final Set<String> TYPE_CHOICE = Set.of("choice", "单选", "选择题", "英译中");
    private static final Set<String> TYPE_SPELL = Set.of("spell", "拼写", "拼写题", "中译英");

    /** 表头别名 -> 内部字段名。查表前统一做 NFKC + 去空白 + 转小写。 */
    private static final Map<String, String> HEADER_ALIAS = new LinkedHashMap<>();

    /** 必需列：内部字段名 -> 给人看的列名（顺序即提示语里的顺序） */
    private static final Map<String, String> REQUIRED_COLS = new LinkedHashMap<>();

    private static final String OPTIONAL_HINT = "（可选列：音标、题型、选项A~D、正确答案、解析）";

    static {
        alias("word", "word");
        alias("单词", "word");
        alias("英文", "word");
        alias("英文单词", "word");

        alias("meaning", "meaning");
        alias("中文释义", "meaning");
        alias("释义", "meaning");
        alias("中文", "meaning");
        alias("意思", "meaning");

        alias("phonetic", "phonetic");
        alias("音标", "phonetic");

        alias("type", "type");
        alias("题型", "type");

        alias("optiona", "optionA");
        alias("选项a", "optionA");
        alias("选项a.", "optionA");
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

        alias("analysis", "analysis");
        alias("解析", "analysis");
        alias("讲解", "analysis");

        REQUIRED_COLS.put("word", "单词");
        REQUIRED_COLS.put("meaning", "中文释义");
    }

    private static void alias(String key, String field) {
        HEADER_ALIAS.put(key, field);
    }

    private final VocabQuestionMapper vocabQuestionMapper;
    private final VocabLevelMapper vocabLevelMapper;

    /** OCR 词库目录（扫描件的单词表要识别成文字才能用） */
    @Value("${app.ocr.datapath:tessdata}")
    private String ocrDatapath;

    /** 识别语言：中英混排要两个都装 */
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
    public VocabImportVO preview(MultipartFile file, Long levelId, String defaultType) {
        return run(file, levelId, defaultType, true);
    }

    /** 真正导入 */
    @Transactional(rollbackFor = Exception.class)
    public VocabImportVO doImport(MultipartFile file, Long levelId, String defaultType) {
        return run(file, levelId, defaultType, false);
    }

    // ================================================================= 主流程

    private VocabImportVO run(MultipartFile file, Long levelId, String defaultType, boolean dryRun) {
        if (levelId == null) {
            throw BizException.badRequest("请先选择要导入的目标关卡");
        }
        VocabLevel level = vocabLevelMapper.selectById(levelId);
        if (level == null) {
            throw BizException.badRequest("目标关卡不存在，请刷新后重试");
        }
        if (file == null || file.isEmpty()) {
            throw BizException.badRequest("请选择要导入的文件");
        }
        String fallbackType = normalizeDefaultType(defaultType);

        List<List<String>> grid;
        VocabImportVO vo = new VocabImportVO();
        vo.setDryRun(dryRun);

        // 读取文件：PDF 单独走解析，其余交给 SheetReader。
        // PDF 不能直接丢给 SheetReader —— 它的兜底分支按文本解二进制流，
        // 结果是满屏乱码行，最后只会报「表头找不到列」，管理员看不出真正原因。
        byte[] bytes = readBytes(file);
        if (PdfText.isPdf(bytes)) {
            VocabPdfParser.Result pdf = VocabPdfParser.parse(bytes, ocrOptions());
            grid = pdf.grid();
            vo.setTip(pdf.tip());
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
        List<Object[]> raw = new ArrayList<>();   // {rowNo, word, meaning, phonetic, typeCell, a, b, c, d, ans, ana}
        for (int i = headerIdx + 1; i < grid.size(); i++) {
            List<String> cells = grid.get(i);
            String word = SheetReader.cell(cells, col.get("word"));
            String meaning = SheetReader.cell(cells, col.get("meaning"));
            if (word.isBlank() && meaning.isBlank() && SheetReader.isRowBlank(cells)) {
                continue;   // 整行空白：Excel 尾部常见，不算数据行
            }
            raw.add(new Object[]{
                    i + 1, word, meaning,
                    SheetReader.cell(cells, col.get("phonetic")),
                    SheetReader.cell(cells, col.get("type")),
                    SheetReader.cell(cells, col.get("optionA")), SheetReader.cell(cells, col.get("optionB")),
                    SheetReader.cell(cells, col.get("optionC")), SheetReader.cell(cells, col.get("optionD")),
                    SheetReader.cell(cells, col.get("answer")), SheetReader.cell(cells, col.get("analysis"))
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

        // --- 干扰项候选池：题库已有释义 + 本文件里其它词的释义 ---
        Set<String> pool = new LinkedHashSet<>(vocabQuestionMapper.selectDistinctMeanings());
        for (Object[] r : raw) {
            String m = ((String) r[2]).trim();
            if (!m.isEmpty()) {
                pool.add(m);
            }
        }

        // --- 已存在的单词（同关卡），用于去重；只取 word 一列 ---
        Set<String> existing = new LinkedHashSet<>();
        for (VocabQuestion old : vocabQuestionMapper.selectList(
                new LambdaQueryWrapper<VocabQuestion>()
                        .select(VocabQuestion::getWord)
                        .eq(VocabQuestion::getLevelId, levelId))) {
            existing.add(SheetReader.normKey(old.getWord()));
        }
        Set<String> seenInFile = new LinkedHashSet<>();

        Random rnd = new Random();
        List<VocabQuestion> pending = new ArrayList<>();
        List<VocabImportVO.Row> previewRows = new ArrayList<>();

        for (Object[] r : raw) {
            int rowNo = (int) r[0];
            String word = ((String) r[1]).trim();
            String meaning = ((String) r[2]).trim();
            String phonetic = ((String) r[3]).trim();
            String typeCell = ((String) r[4]).trim();
            String oa = ((String) r[5]).trim();
            String ob = ((String) r[6]).trim();
            String oc = ((String) r[7]).trim();
            String od = ((String) r[8]).trim();
            String ansCell = ((String) r[9]).trim();
            String analysis = ((String) r[10]).trim();

            // 1) 必填
            if (word.isEmpty()) {
                vo.getErrors().add(new VocabImportVO.RowError(rowNo, "「单词」列是空的"));
                continue;
            }
            if (meaning.isEmpty()) {
                vo.getErrors().add(new VocabImportVO.RowError(rowNo, "「中文释义」列是空的"));
                continue;
            }

            // 2) 题型
            String type = resolveType(typeCell, fallbackType);
            if (type == null) {
                vo.getErrors().add(new VocabImportVO.RowError(rowNo,
                        "题型「" + typeCell + "」无法识别，可填：单选 / 拼写（留空则按所选默认题型）"));
                continue;
            }

            VocabImportVO.Row pr = new VocabImportVO.Row();
            pr.setRowNo(rowNo);
            pr.setType(type);
            pr.setWord(word);
            pr.setMeaning(meaning);

            // 3) 组装选项与答案
            if ("SPELL".equals(type)) {
                // 拼写题不需要选项，答案固定是单词本身（与手工表单一致）
                pr.setOptionA("");
                pr.setOptionB("");
                pr.setOptionC("");
                pr.setOptionD("");
                pr.setAnswer(word);
                if (!ansCell.isEmpty() && !SheetReader.normKey(ansCell).equals(SheetReader.normKey(word))) {
                    pr.setNote("拼写题的答案固定为单词本身，已忽略文件里填的「" + ansCell + "」");
                }
            } else {
                boolean anyOption = !oa.isEmpty() || !ob.isEmpty() || !oc.isEmpty() || !od.isEmpty();
                if (anyOption && (oa.isEmpty() || ob.isEmpty() || oc.isEmpty() || od.isEmpty())) {
                    vo.getErrors().add(new VocabImportVO.RowError(rowNo,
                            "选项只填了部分（" + countNonBlank(oa, ob, oc, od) + "/4）："
                                    + "要么 4 个都填，要么全部留空让系统自动生成"));
                    continue;
                }
                if (anyOption) {
                    // 手填选项：只校验答案字母，并核对"答案那一项的文字就是中文释义"
                    String ans = ansCell.toUpperCase(Locale.ROOT);
                    if (ans.isEmpty()) {
                        vo.getErrors().add(new VocabImportVO.RowError(rowNo, "已填写选项，但没有填「正确答案」"));
                        continue;
                    }
                    if (!ans.matches("[ABCD]")) {
                        vo.getErrors().add(new VocabImportVO.RowError(rowNo,
                                "「正确答案」只能是 A/B/C/D，当前是「" + ansCell + "」"));
                        continue;
                    }
                    String chosen = switch (ans) {
                        case "A" -> oa;
                        case "B" -> ob;
                        case "C" -> oc;
                        default -> od;
                    };
                    if (!SheetReader.normKey(chosen).equals(SheetReader.normKey(meaning))) {
                        vo.getErrors().add(new VocabImportVO.RowError(rowNo,
                                "正确答案选了 " + ans + "，但该项文字「" + chosen
                                        + "」与「中文释义」列的「" + meaning + "」不一致，请核对"));
                        continue;
                    }
                    pr.setOptionA(oa);
                    pr.setOptionB(ob);
                    pr.setOptionC(oc);
                    pr.setOptionD(od);
                    pr.setAnswer(ans);
                } else {
                    // 自动生成：从候选池里挑 3 个干扰项，随机决定正确项位置
                    List<String> distractors = pickDistractors(meaning, pool, 3, rnd);
                    if (distractors.size() < 3) {
                        vo.getErrors().add(new VocabImportVO.RowError(rowNo,
                                "题库里可用的其它释义不足 3 条，无法自动生成选项，请把选项 A~D 填满"));
                        continue;
                    }
                    int slot = rnd.nextInt(4);
                    List<String> four = new ArrayList<>(distractors);
                    four.add(slot, meaning);
                    pr.setOptionA(four.get(0));
                    pr.setOptionB(four.get(1));
                    pr.setOptionC(four.get(2));
                    pr.setOptionD(four.get(3));
                    pr.setAnswer(String.valueOf((char) ('A' + slot)));
                    pr.setAutoOptions(true);
                }
            }

            // 4) 去重：同关卡同单词（不区分大小写），文件内重复也算
            String key = SheetReader.normKey(word);
            if (existing.contains(key)) {
                vo.getSkippedRows().add(new VocabImportVO.RowError(rowNo, "单词「" + word + "」在该关卡已存在，已跳过"));
                continue;
            }
            if (!seenInFile.add(key)) {
                vo.getSkippedRows().add(new VocabImportVO.RowError(rowNo, "单词「" + word + "」在文件里重复出现，只保留第一条"));
                continue;
            }

            // 5) 组装实体
            VocabQuestion q = new VocabQuestion();
            q.setLevelId(levelId);
            q.setType(type);
            q.setWord(word);
            q.setPhonetic(phonetic.isEmpty() ? null : phonetic);
            q.setMeaning(meaning);
            q.setOptionA(SheetReader.blankToNull(pr.getOptionA()));
            q.setOptionB(SheetReader.blankToNull(pr.getOptionB()));
            q.setOptionC(SheetReader.blankToNull(pr.getOptionC()));
            q.setOptionD(SheetReader.blankToNull(pr.getOptionD()));
            q.setAnswer(pr.getAnswer());
            q.setAnalysis(analysis.isEmpty() ? ANALYSIS_TPL.formatted(word, meaning) : analysis);
            q.setStatus(1);
            q.setCreateTime(LocalDateTime.now());
            pending.add(q);

            if (previewRows.size() < SheetReader.PREVIEW_ROWS) {
                previewRows.add(pr);
            }
        }

        vo.setFailed(vo.getErrors().size());
        vo.setSkipped(vo.getSkippedRows().size());
        vo.setInsertable(pending.size());
        vo.setPreview(previewRows);

        if (!dryRun) {
            for (VocabQuestion q : pending) {
                vocabQuestionMapper.insert(q);
            }
            vo.setInserted(pending.size());
            log.info("词汇批量导入：关卡 {} 成功 {} 条，跳过 {} 条，失败 {} 条",
                    levelId, pending.size(), vo.getSkipped(), vo.getFailed());
        }
        return vo;
    }

    // ================================================================= 选项与去重

    private static String normalizeDefaultType(String defaultType) {
        if (defaultType == null || defaultType.isBlank()) {
            return "CHOICE";
        }
        String t = defaultType.trim().toUpperCase(Locale.ROOT);
        if (!"CHOICE".equals(t) && !"SPELL".equals(t)) {
            throw BizException.badRequest("默认题型只能是 CHOICE 或 SPELL");
        }
        return t;
    }

    /** 返回 CHOICE / SPELL；无法识别返回 null（由调用方转成行错误） */
    private static String resolveType(String typeCell, String fallbackType) {
        if (typeCell == null || typeCell.isBlank()) {
            return fallbackType;
        }
        String key = SheetReader.normHeader(typeCell);
        if (TYPE_CHOICE.contains(key)) {
            return "CHOICE";
        }
        if (TYPE_SPELL.contains(key)) {
            return "SPELL";
        }
        return null;
    }

    /**
     * 从候选池里挑 n 个与正确答案不同的干扰项。
     *
     * <p>只做两件事：排除与正确释义同义（归一化后相等）的条目、排除重复。
     * 刻意不做"语义相近度"筛选 —— 释义本身不带词性/语义标签，硬凑相似度
     * 只会引入不可解释的规则；同词库里的释义作干扰项已经足够有区分度。</p>
     */
    private static List<String> pickDistractors(String correct, Set<String> pool, int n, Random rnd) {
        String correctKey = SheetReader.normKey(correct);
        List<String> candidates = new ArrayList<>();
        Set<String> takenKeys = new LinkedHashSet<>();
        for (String m : pool) {
            String key = SheetReader.normKey(m);
            if (key.isEmpty() || key.equals(correctKey) || !takenKeys.add(key)) {
                continue;
            }
            candidates.add(m.trim());
        }
        if (candidates.size() <= n) {
            return candidates;
        }
        Collections.shuffle(candidates, rnd);
        return new ArrayList<>(candidates.subList(0, n));
    }

    private static int countNonBlank(String... values) {
        int n = 0;
        for (String v : values) {
            if (v != null && !v.isBlank()) {
                n++;
            }
        }
        return n;
    }
}
