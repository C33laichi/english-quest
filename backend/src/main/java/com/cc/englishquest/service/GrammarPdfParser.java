package com.cc.englishquest.service;

import com.cc.englishquest.common.BizException;
import com.cc.englishquest.common.PdfOcr;
import com.cc.englishquest.common.PdfText;
import lombok.extern.slf4j.Slf4j;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 把「带文字层的题库 PDF」解析成 {@link com.cc.englishquest.common.SheetReader} 那种
 * 「行 × 列」网格，之后直接复用 {@code GrammarImportService} 的整套校验/去重逻辑。
 *
 * <p>这样做的原因：PDF 只是"另一种装题目的信封"，真正麻烦的是 Day 归属、选项完整性、
 * 答案合法性、同天去重这些规则 —— 那些逻辑已经写在导入服务里了，再复制一份必然走偏。
 * 所以这里**只负责把版面还原成表**，一行一道题，列就是 CSV 模板那几列。</p>
 *
 * <h3>能认的版式</h3>
 * <pre>
 * 第2天 冠词考点 [学习]          ← 分节：决定这一批题归到哪个 Day（按标题匹配）
 * 练习题
 * 【单选】 1. He is ______ honest man.
 * A. a
 * B. an
 * C. the
 * D. /
 * 【答案】B
 * 解析：honest 的 h 不发音……
 * </pre>
 *
 * <h3>刻意不做的两件事</h3>
 * <ol>
 *   <li><b>不把【填空】【翻译】改造成选择题。</b>那需要凭空编三个干扰项，编出来的题
 *       大概率"一眼假"，比少几道题糟糕得多。这类题统一跳过，并在结果里说清跳了多少。</li>
 *   <li><b>不做 OCR。</b>扫描件没有文字层，抽出来只有页码。这种情况直接报错并提示用户，
 *       而不是给一个"导入 0 条"的哑结果。</li>
 * </ol>
 */
@Slf4j
public final class GrammarPdfParser {

    /** 网格表头：列名与 CSV 模板的别名表对齐（SheetReader.HEADER_ALIAS 认这些名字） */
    private static final List<String> HEADER =
            List.of("题干", "选项A", "选项B", "选项C", "选项D", "正确答案", "天数", "解析");

    /** 列下标（与 HEADER 对应）：AI 补答案时按位置回填这两列 */
    public static final int COL_STEM = 0;
    public static final int COL_A = 1;
    public static final int COL_D = 4;
    public static final int COL_ANSWER = 5;
    public static final int COL_DAY = 6;
    public static final int COL_ANALYSIS = 7;

    /** 分节标题：第N天 XXX [学习] */
    private static final Pattern SECTION = Pattern.compile("^第\\s*(\\d{1,2})\\s*天\\s*(.+)$");

    /** 题型/答案标记：【单选】【填空】【答案】…… */
    private static final Pattern MARKER = Pattern.compile("^【\\s*([^】]{1,8})\\s*】\\s*(.*)$");

    /** 选项行：A. xxx / A、xxx / Ａ．xxx */
    private static final Pattern OPTION =
            Pattern.compile("^([A-Da-dＡ-Ｄａ-ｄ])\\s*[.．、,，)）:：]\\s*(.*)$");

    /** 页码行：— 5 — / - 5 - / ～5～ */
    private static final Pattern PAGE_NO =
            Pattern.compile("^[—\\-–－~～]{1,2}\\s*\\d{1,3}\\s*[—\\-–－~～]{1,2}$");

    /** 题号前缀：1. / 1、/ 1) */
    private static final Pattern NUM_PREFIX = Pattern.compile("^\\d{1,3}\\s*[.、．)）]\\s*");

    /** 扫描件（OCR）里没有【题型】标记，只能靠「1. / 2. / 3.」题号切题 */
    private static final Pattern NUMBERED =
            Pattern.compile("^\\d{1,3}\\s*[.、．)）]\\s*\\S.*$");

    /** 一道题的答案行：【答案】B */
    private static final Pattern ANSWER_MARK = Pattern.compile("^【\\s*答案\\s*】\\s*(.*)$");

    /** 答案只认单个 A~D（后面允许跟标点或说明，如 "B. 因为…"） */
    private static final Pattern ANSWER_LETTER =
            Pattern.compile("^([A-D])\\s*(?:[.．、)）:：].*|\\s.*)?$");

    /** 解析行的前缀：解析：/ 分析：/ 【解析】 */
    private static final Pattern ANALYSIS_PREFIX =
            Pattern.compile("^(?:解析|分析|点拨|【\\s*解析\\s*】)\\s*[：:]?\\s*");

    /** 选项行的行首：A. / B、/ Ｃ． */
    private static final Pattern OPTION_HEAD =
            Pattern.compile("^[A-DＡ-Ｄａ-ｄ]\\s*[.．、,，)）:：]");

    /** 选项分隔：一行里挤了多个选项时，按这个切（"A. in B. on" → A、B） */
    private static final Pattern OPTION_SPLIT =
            Pattern.compile("([A-DＡ-Ｄａ-ｄ])\\s*[.．、,，)）:：]\\s*");

    /** 两个汉字之间的空格（Tesseract 用 chi_sim 时会把中文逐字断开，得粘回去） */
    private static final Pattern CJK_GAP =
            Pattern.compile("(?<=[\\u4E00-\\u9FFF])\\s+(?=[\\u4E00-\\u9FFF])");

    /** 视为单选题的题型名 */
    private static final Set<String> CHOICE_ALIAS =
            Set.of("单选", "单选题", "单项选择", "单项选择 题", "选择题", "选择", "单项选择题", "单项");

    /** 平均每页字数低于这个值 → 基本可以判定是扫描件（文字版都在几百以上） */
    private static final double SCANNED_TEXT_PER_PAGE = 40;

    private GrammarPdfParser() {
    }

    /**
     * 解析结果。
     *
     * @param grid          表头 + 数据行的网格（可直接喂给导入流程）
     * @param tip           给人看的解析摘要（多少单选、跳过了什么题型）
     * @param pages         页数
     * @param choices       成功整理成行的单选题数
     * @param skipped       因非选择题被跳过的题数
     * @param missingAnswer 其中答案为空的行数（扫描件 PDF 没有答案页时等于 choices）
     */
    public record Result(List<List<String>> grid, String tip, int pages, int choices, int skipped,
                         int missingAnswer) {
    }

    // ================================================================= 入口

    public static Result parse(byte[] bytes, PdfOcr.Options ocrOptions) {
        PdfText.Extracted doc = PdfText.extract(bytes);
        String text = doc.text();
        int pages = doc.pages();
        boolean ocr = false;
        boolean truncated = false;

        // 没有文字层 = 扫描件：改走 OCR。注意这个判断必须在解析之前做，
        // 因为扫描件抽出来的"文字"只有页码，直接解析会得到 0 道题然后报一个误导性的错。
        if (doc.textPerPage() < SCANNED_TEXT_PER_PAGE) {
            PdfOcr.Options opts = ocrOptions == null
                    ? new PdfOcr.Options(null, null, 0, 0) : ocrOptions;
            if (!PdfOcr.isAvailable(opts)) {
                throw BizException.badRequest("这份 PDF 是扫描图片（没有文字层），需要 OCR 才能读。"
                        + PdfOcr.missingDataHint(opts));
            }
            PdfOcr.Result r = PdfOcr.recognize(bytes, opts);
            text = r.text();
            pages = r.pages();
            ocr = true;
            truncated = r.truncated();
        }

        List<String> lines = cleanLines(text);

        List<Raw> blocks = splitBlocks(lines);
        Map<String, Integer> skippedByType = new LinkedHashMap<>();
        List<String> problems = new ArrayList<>();
        List<List<String>> rows = new ArrayList<>();
        int choices = 0;
        int skipped = 0;
        int missingAnswer = 0;

        for (Raw b : blocks) {
            if (!isChoice(b.type)) {
                skipped++;
                skippedByType.merge(b.type.isBlank() ? "未标注题型" : b.type, 1, Integer::sum);
                continue;
            }
            choices++;
            String[] row = toRow(b);
            if (row == null) {
                problems.add("第 " + b.section + " 节的「" + brief(b.head) + "」选项或答案不全");
                continue;
            }
            if (row[COL_ANSWER].isEmpty()) {
                missingAnswer++;
            }
            rows.add(new ArrayList<>(List.of(row)));   // 可变：AI 补答案时要就地改这两列
        }

        if (choices == 0 || rows.isEmpty()) {
            throw noQuestionError(ocr, choices > 0);
        }

        List<List<String>> grid = new ArrayList<>();
        grid.add(HEADER);
        grid.addAll(rows);

        return new Result(grid,
                buildTip(pages, ocr, truncated, choices, rows.size(), skipped, skippedByType, problems, missingAnswer),
                pages, choices, skipped, missingAnswer);
    }

    // ================================================================= 版面清洗

    /**
     * 切成"干净的行"：去掉页码、页眉页脚这类每页重复的版式噪音。
     *
     * <p>做法是**按重复次数判断**而不是硬编码书名 —— 在整份文档里出现 3 次以上、
     * 又不像题目内容（选项行、题号行、含填空下划线的题干）的行，几乎只能是版式元素。
     * 这样换一本 PDF 也不用改代码。</p>
     */
    private static List<String> cleanLines(String text) {
        String[] raw = text.replace('\f', '\n').replace("\r\n", "\n").replace('\r', '\n').split("\n");

        List<String> normalized = new ArrayList<>(raw.length);
        Map<String, Integer> freq = new LinkedHashMap<>();
        for (String r : raw) {
            String s = r.replace('\u00A0', ' ').replace('\u3000', ' ').trim().replaceAll("\\s+", " ");
            normalized.add(s);
            if (!s.isEmpty()) {
                freq.merge(s, 1, Integer::sum);
            }
        }

        List<String> out = new ArrayList<>(normalized.size());
        for (String s : normalized) {
            if (s.isEmpty() || PAGE_NO.matcher(s).matches()) {
                continue;
            }
            if (freq.getOrDefault(s, 0) >= 3 && !looksLikeContent(s)) {
                continue;   // 页眉 / 书名 / 大标题：每页都出现
            }
            out.add(s);
        }
        return out;
    }

    /** 看着像题目内容（选项、题号、填空、标记）就不当版式噪音删掉 */
    private static boolean looksLikeContent(String s) {
        return s.startsWith("【")
                || OPTION.matcher(s).matches()
                || NUM_PREFIX.matcher(s).find()
                || s.contains("____")
                || s.startsWith("解析");
    }

    // ================================================================= 切题块

    /** 一道题的原始素材：题型、所属分节标题、题面首行、后续所有行 */
    private static final class Raw {
        String type = "";
        String section = "";
        String head = "";
        final List<String> lines = new ArrayList<>();
    }

    /**
     * 扫描全文，把每道题切成一块。
     *
     * <p>{@code 【答案】} 不是新题的开始，而是当前题的组成部分，所以要单独认；
     * 其余 {@code 【xx】} 都当作"新的一块"。</p>
     */
    private static List<Raw> splitBlocks(List<String> lines) {
        List<Raw> blocks = new ArrayList<>();
        String section = "";
        Raw cur = null;
        // 两份语料长相完全不同：文字版语法书有【单选】标记，扫描件只有题号。
        // 先看整份文档里有没有标记，再决定用哪种切法 —— 混着用会把「解析：」里的
        // 中文当题型、或者把带【】的行漏掉。
        boolean markerMode = lines.stream().anyMatch(s -> MARKER.matcher(s).find());

        for (String s : lines) {
            Matcher sec = SECTION.matcher(s);
            if (sec.matches() && isSectionTitle(sec.group(2))) {
                section = cleanSectionTitle(sec.group(2));
                continue;
            }

            if (markerMode) {
                Matcher mk = MARKER.matcher(s);
                if (mk.matches()) {
                    String type = mk.group(1).trim();
                    if (type.contains("答案")) {
                        // 归属当前题；cur 为空说明这份 PDF 的排版不是我们认识的形状，丢掉即可
                        if (cur != null) {
                            cur.lines.add(s);
                        }
                        continue;
                    }
                    if (type.contains("解析")) {
                        if (cur != null) {
                            cur.lines.add(mk.group(2).trim());
                        }
                        continue;
                    }
                    cur = new Raw();
                    cur.type = type;
                    cur.section = section;
                    cur.head = mk.group(2).trim();
                    blocks.add(cur);
                    continue;
                }
            } else if (NUMBERED.matcher(s).matches() && !OPTION_HEAD.matcher(s).find()) {
                // 题号模式：一行「1. xxx」就是一道新题，题型当作单选（题库整本都是选择题）
                cur = new Raw();
                cur.type = "单选";
                cur.section = section;
                cur.head = s;
                blocks.add(cur);
                continue;
            }

            if (cur != null) {
                cur.lines.add(s);
            }
        }
        return blocks;
    }

    /**
     * 判断"第N天 XXX"后面那截是不是讲义标题。
     *
     * <p>不靠 {@code [学习]} 这种标记（换个 PDF 就没），而是排除法：标题很短、
     * 没有句号问号、不带填空下划线、不夹【】。题目句子不会这么短。</p>
     */
    private static boolean isSectionTitle(String rest) {
        String t = rest.replaceAll("\\[[^\\]]*]", "").trim();
        if (t.isEmpty() || t.length() > 26) {
            return false;
        }
        return !t.contains("。") && !t.contains("？") && !t.contains("?")
                && !t.contains("____") && !t.contains("【");
    }

    private static String cleanSectionTitle(String rest) {
        return rest.replaceAll("\\[[^\\]]*]", "").trim();
    }

    // ================================================================= 单题解析

    /**
     * 把一块素材整理成一行网格。
     *
     * <p>答案列允许为空 —— 扫描件（每日刷题那类）本身就没有答案，只要题干和四个选项
     * 齐全就算"识别成功"，答案交给后续补全（AI 作答或人工）。</p>
     *
     * @return {@code null} 表示这题残缺（缺选项、或答案行读不出 A~D），调用方计入问题清单
     */
    private static String[] toRow(Raw b) {
        // 题干首行 + 后续行拼一起看：选项行、答案行都可能被分页切断
        List<String> content = new ArrayList<>();
        if (!b.head.isBlank()) {
            content.add(b.head);
        }
        content.addAll(b.lines);

        int ansIdx = -1;
        for (int i = 0; i < content.size(); i++) {
            if (ANSWER_MARK.matcher(content.get(i)).matches()) {
                ansIdx = i;
                break;
            }
        }
        int bodyEnd = ansIdx < 0 ? content.size() : ansIdx;

        StringBuilder stem = new StringBuilder();
        Map<Character, StringBuilder> options = new LinkedHashMap<>();
        Character last = null;

        for (int i = 0; i < bodyEnd; i++) {
            String s = content.get(i);
            Map<Character, String> onLine = extractOptions(s);
            if (!onLine.isEmpty()) {
                // 一行可能只有一个选项，也可能四个挤在同一行（扫描件常见）
                for (Map.Entry<Character, String> e : onLine.entrySet()) {
                    options.put(e.getKey(), new StringBuilder(e.getValue()));
                    last = e.getKey();
                }
            } else if (last != null) {
                // 选项太长换行了：接到上一个选项后面，而不是当成新句子塞进题干。
                // 但要挡住两种脏数据：
                //   ① 水印/页眉串进来（英语选项后面突然冒出一串中文）
                //   ② D 之后还有多余的行 —— 四个选项已经齐了，多出来的多半是页脚、
                //      二维码说明之类。宁可丢掉 D 的续行，也不要把水印拼进选项。
                String cur = options.get(last).toString();
                boolean pollution = hasCjk(s) && !hasCjk(cur);
                if (!pollution && last != 'D') {
                    options.get(last).append(' ').append(s);
                }
            } else {
                if (stem.length() > 0) {
                    stem.append(' ');
                }
                stem.append(s);
            }
        }

        String stemText = tidy(NUM_PREFIX.matcher(stem.toString()).replaceFirst(""));
        if (stemText.isEmpty()) {
            return null;
        }

        // 选项没单独占行时（整题挤在一行，如「1. xxx A. a B. b C. c D. d」），从题干尾部再切一次
        if (options.size() < 4) {
            Matcher inline = Pattern.compile("(?:^|\\s)A\\s*[.．、,，)）:：]\\s*").matcher(stemText);
            if (inline.find()) {
                Map<Character, String> tail = extractOptions(stemText.substring(inline.start()).trim());
                if (tail.size() == 4) {
                    stemText = tidy(stemText.substring(0, inline.start()));
                    options.clear();
                    tail.forEach((k, v) -> options.put(k, new StringBuilder(v)));
                }
            }
        }

        if (!(options.containsKey('A') && options.containsKey('B')
                && options.containsKey('C') && options.containsKey('D'))) {
            return null;
        }

        String answer = "";
        if (ansIdx >= 0) {
            Matcher am = ANSWER_MARK.matcher(content.get(ansIdx));
            String ansRaw = am.matches() ? am.group(1).trim().toUpperCase(Locale.ROOT) : "";
            Matcher lm = ANSWER_LETTER.matcher(ansRaw);
            // 读不出 A~D（例如填空题的【答案】women → women）就当没有答案，不强行猜
            if (lm.matches()) {
                answer = lm.group(1);
            }
        }

        StringBuilder ana = new StringBuilder();
        for (int i = ansIdx < 0 ? content.size() : ansIdx + 1; i < content.size(); i++) {
            String s = content.get(i).trim();
            if (s.isEmpty()) {
                continue;
            }
            if (ana.length() > 0) {
                ana.append(' ');
            }
            ana.append(s);
        }
        String analysis = tidy(ANALYSIS_PREFIX.matcher(ana.toString()).replaceFirst(""));

        return new String[]{
                stemText,
                tidy(options.get('A').toString()),
                tidy(options.get('B').toString()),
                tidy(options.get('C').toString()),
                tidy(options.get('D').toString()),
                answer,
                b.section,          // 「天数」列：填讲义标题，由导入服务按标题映射到 Day
                analysis
        };
    }

    /**
     * 从一行里抽出所有选项（可能只有 1 个，也可能 4 个挤在一行）。
     *
     * <p>行首必须先是选项标记才认 —— 否则题干里出现的「B.」会被误当成选项，
     * 把整句题干切碎。多选项的情况（{@code A. in B. on C. of D. to}）按标记位置切段，
     * 每段的文字归前一个字母。</p>
     */
    private static Map<Character, String> extractOptions(String line) {
        Map<Character, String> found = new LinkedHashMap<>();
        if (line == null || !OPTION_HEAD.matcher(line).find()) {
            return found;
        }
        Matcher m = OPTION_SPLIT.matcher(line);
        List<int[]> marks = new ArrayList<>();
        List<Character> letters = new ArrayList<>();
        while (m.find()) {
            marks.add(new int[]{m.start(), m.end()});
            letters.add(normalizeLetter(m.group(1)));
        }
        for (int i = 0; i < marks.size(); i++) {
            int from = marks.get(i)[1];
            int to = i + 1 < marks.size() ? marks.get(i + 1)[0] : line.length();
            found.putIfAbsent(letters.get(i), tidy(line.substring(from, to)));
        }
        return found;
    }

    private static char normalizeLetter(String s) {
        char c = s.charAt(0);
        if (c >= 'Ａ' && c <= 'Ｄ') {
            return (char) ('A' + (c - 'Ａ'));
        }
        return Character.toUpperCase(c);
    }

    /** 是否含汉字（用来判断"这行是不是串进来的中文水印"） */
    private static boolean hasCjk(String s) {
        for (int i = 0; i < s.length(); i++) {
            if (Character.UnicodeScript.of(s.charAt(i)) == Character.UnicodeScript.HAN) {
                return true;
            }
        }
        return false;
    }

    /** 收尾：去掉多余空白与零宽字符，并把被 OCR 拆散的中文粘回去 */
    private static String tidy(String s) {
        if (s == null) {
            return "";
        }
        String t = s.replace("\u200B", "").replace("\uFEFF", "").replaceAll("\\s+", " ").trim();
        return CJK_GAP.matcher(t).replaceAll("");
    }

    // ================================================================= 提示文案

    private static boolean isChoice(String type) {
        String t = type.replaceAll("\\s+", "");
        return CHOICE_ALIAS.contains(t) || t.startsWith("单选");
    }

    private static BizException noQuestionError(boolean ocr, boolean hasBlocks) {
        if (ocr && !hasBlocks) {
            return BizException.badRequest(
                    "扫描件认出了文字，但里面没有以「1.」「2.」编号的题目。"
                            + "这份资料更像是纯讲解或阅读文章（阅读理解题还需要先给一段文章，"
                            + "本模块只收单选题），没法直接导入。"
                            + "如果它确实有选择题，可以把含题目的那几页单独截出来另存为 PDF 再试");
        }
        if (ocr) {
            return BizException.badRequest(
                    "扫描件认出了文字，但没能拼出完整的单选题（题干 + A/B/C/D 四个选项）。"
                            + "多半是分辨率太低、或者选项被排成了图片/表格。"
                            + "可以截取题目更清楚的一段另存为 PDF 再试，或者改用 Excel/CSV 模板导入");
        }
        return BizException.badRequest(
                "这个 PDF 有文字，但没找到「【单选】」这类题目标记，认不出题目结构。"
                        + "目前支持的是「章节标题 + 【单选】N. 题干 + A./B./C./D. + 【答案】X」这种版式；"
                        + "如果题库格式不一样，建议用 Excel/CSV 模板导入（页面上可以下载模板）");
    }

    private static String buildTip(int pages, boolean ocr, boolean truncated, int choices, int usable,
                                   int skipped, Map<String, Integer> skippedByType,
                                   List<String> problems, int missingAnswer) {
        StringBuilder sb = new StringBuilder();
        sb.append(ocr ? "扫描件 OCR：" : "PDF：").append(pages).append(" 页，识别到 ")
                .append(choices).append(" 道单选题");
        if (truncated) {
            sb.append("（超过单次识别上限，只处理了前若干页）");
        }
        if (usable < choices) {
            sb.append("，其中 ").append(choices - usable).append(" 道因为选项不全没能识别");
        }
        sb.append("。");

        if (skipped > 0) {
            sb.append("另有 ").append(skipped).append(" 道非选择题按规则跳过：");
            List<String> parts = new ArrayList<>();
            skippedByType.forEach((k, v) -> parts.add(k + " " + v));
            sb.append(String.join("、", parts));
            sb.append("。本系统只支持单选题，这些题需要人工改成选择题或另建题型。");
        }
        if (!problems.isEmpty()) {
            sb.append("有 ").append(problems.size()).append(" 道单选题解析失败（多半是选项被排版成表格或图片）。");
        }
        if (missingAnswer > 0) {
            sb.append("注意：其中 ").append(missingAnswer).append(" 道题在 PDF 里没有答案（这份资料只给了题目），");
            sb.append("答案需要另外补。");
        }
        return sb.toString();
    }

    private static String brief(String s) {
        String t = tidy(s);
        return t.length() <= 24 ? t : t.substring(0, 24) + "…";
    }
}
