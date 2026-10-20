package com.cc.englishquest.service;

import com.cc.englishquest.common.BizException;
import com.cc.englishquest.common.PdfOcr;
import com.cc.englishquest.common.PdfText;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 词汇题 PDF 解析：把「单词表」还原成 {@code 单词 / 中文释义 / 音标} 三列。
 *
 * <p><b>与语法 PDF 解析的根本差别</b>：语法题要切「题干 + 四选项 + 答案」，
 * 一份讲义里混着填空、翻译、改错，必须判断题型；单词表的结构简单得多 ——
 * 一行就是一个词条，只要认出「英文单词在哪结束、中文释义从哪开始」。
 * 所以这里没有 AI 补答案：词汇题的干扰项是从题库已有释义里借的，
 * 只要有单词和释义就能出题，不存在"答案缺失"这回事。</p>
 *
 * <p><b>输出刻意设计成"表格模样"</b>：返回的 grid 首行是表头
 * （{@code 单词 | 中文释义 | 音标}），后面每行一个词条。这样它可以原样喂给
 * {@link SheetReader#mapHeader} 与后续的校验/去重/干扰项生成，
 * 词汇导入的整条下游逻辑一行都不用改 —— PDF 只是"另一种读文件的方式"。</p>
 *
 * <p><b>识别一条的规则</b>（按顺序剥）：</p>
 * <ol>
 *   <li>行首序号 {@code 1.} / {@code 12、} / {@code 3 } —— 单词表几乎都带编号</li>
 *   <li>行首英文（最多 5 个词，够覆盖 give up / take care of 这类词组）</li>
 *   <li>音标 {@code /əˈbændən/} 或 {@code [..]}，两种写法都可能出现</li>
 *   <li>词性 {@code n.} {@code vt.} {@code adj.} 及 {@code vt./vi.} 这类连写</li>
 *   <li>剩下的就是释义；没有中文的残行（页眉、页码、纯英文标题）直接丢掉</li>
 * </ol>
 */
public final class VocabPdfParser {

    /** 输出给导入流程的表头，列名必须是 VocabImportService 认识的别名 */
    private static final List<String> HEADER = List.of("单词", "中文释义", "音标");

    /** 平均每页文字量低于这个值就判定为扫描件（与语法解析同一口径） */
    private static final double SCANNED_TEXT_PER_PAGE = 40;

    private static final Pattern CJK = Pattern.compile("[\\u4E00-\\u9FFF]");

    /** 行首序号：允许 1. / 1、/ 1) / 1 后面跟空白 */
    private static final Pattern LEADING_NO = Pattern.compile("^\\s*\\d{1,4}\\s*[.、．,，)）:：]?\\s*");

    /**
     * 一个英文词：字母开头，允许连字符与撇号。
     *
     * <p>★ 末尾的 {@code (?![.．])} 配 {@code *+}（占有量词）缺一不可：
     * 单词表里「ambiguous&nbsp;&nbsp;&nbsp;adj. 模棱两可的」这种写法很常见，
     * 若让 {@code adj} 被当成第二个单词，单词列就会变成 {@code "ambiguous  adj"}。
     * 用占有量词是为了禁止回溯 —— 否则引擎会退而求其次匹配成 {@code ad} + 剩下的 {@code j.}。</p>
     */
    private static final String WORD_TOKEN = "[A-Za-z][A-Za-z'’\\-]*+(?![.．])";

    /** 英文词条：首字母开头，最多 5 个单词（词组），不吃后面带点的词性缩写 */
    private static final Pattern ENTRY = Pattern.compile(
            "^(" + WORD_TOKEN + "(?:\\s+" + WORD_TOKEN + "){0,4})\\s*(.*)$");

    /** 音标：/.../ 或 [...]，长度限死免得把后面整段吞掉 */
    private static final Pattern PHONETIC = Pattern.compile("^\\s*[/\\[][^/\\]]{0,40}?[/\\]]\\s*");

    /** 词性：n. v. vt. vi. adj. adv. prep. conj. pron. num. art. int. aux. abbr. ph. 及 vt./vi. 连写 */
    private static final Pattern POS = Pattern.compile(
            "^(?:[A-Za-z]{1,5}\\.\\s*(?:[/、,，]\\s*)?)+");

    /** 释义前残留的分隔符：破折号、等号、冒号、竖线等 */
    private static final Pattern LEAD_SEP = Pattern.compile("^[\\s\\-—–:：=,，、;；.·|]+");

    /**
     * 词性缩写集合。
     *
     * <p>带点的 {@code adj.} 已经被 {@link #WORD_TOKEN} 挡在单词之外了，
     * 但 OCR 常把点号吃掉变成 {@code adj}，那时候它就长得像一个普通单词，
     * 会被并进单词列（实测出现过 {@code "Qs ambi guous adj"}）。所以这里再兜一道：
     * 单词末尾若挂着词性缩写，直接剪掉。</p>
     */
    private static final Set<String> POS_WORDS = Set.of(
            "n", "v", "vt", "vi", "adj", "adv", "prep", "conj", "pron",
            "num", "art", "int", "aux", "abbr", "pl", "ph", "phr");

    /** 行尾的页码引用：P12 / (P12) / 第 12 页 */
    private static final Pattern TRAIL_REF = Pattern.compile("[\\s(（\\[]*(?:[Pp]\\s?\\d{1,4}|第\\s*\\d{1,4}\\s*页)[)）\\]]*\\s*$");

    private VocabPdfParser() {
    }

    /**
     * @param grid    表头 + 词条行，可直接交给 {@link SheetReader}
     * @param tip     给管理员看的识别摘要（页数、是否 OCR、认出多少条、忽略多少行）
     * @param pages   PDF 总页数
     * @param entries 认出的词条数
     * @param skipped 有内容但没认出来的行数
     */
    public record Result(List<List<String>> grid, String tip, int pages, int entries, int skipped) {
    }

    /** 解析出来的一行 */
    record Entry(String word, String meaning, String phonetic) {
    }

    public static Result parse(byte[] bytes, PdfOcr.Options ocrOptions) {
        PdfText.Extracted doc = PdfText.extract(bytes);
        String text = doc.text();
        int pages = doc.pages();
        boolean ocr = false;
        boolean truncated = false;

        // 没有文字层就是扫描件。这一步必须先做：扫描件直接抽文字只得到页码，
        // 硬解析的结果是 0 条，报出来的错还会指向"格式不对"，让人白折腾。
        if (doc.textPerPage() < SCANNED_TEXT_PER_PAGE) {
            PdfOcr.Options opts = ocrOptions == null
                    ? new PdfOcr.Options(null, null, 0, 0) : ocrOptions;
            if (!PdfOcr.isAvailable(opts)) {
                throw BizException.badRequest("这份 PDF 是扫描图片（没有文字层），需要 OCR 才能读。"
                        + PdfOcr.missingDataHint(opts));
            }
            PdfOcr.Result r = PdfOcr.recognize(bytes, opts, PdfOcr.Layout.PLAIN);
            text = r.text();
            pages = r.pages();
            ocr = true;
            truncated = r.truncated();
        }

        List<List<String>> rows = new ArrayList<>();
        int skipped = 0;
        for (String raw : text.split("\n")) {
            String line = raw.strip();
            if (line.isEmpty()) {
                continue;
            }
            Entry e = parseLine(line);
            if (e == null) {
                skipped++;
                continue;
            }
            rows.add(List.of(e.word(), e.meaning(), e.phonetic()));
        }

        if (rows.isEmpty()) {
            throw noEntryError(ocr, skipped);
        }

        List<List<String>> grid = new ArrayList<>();
        grid.add(HEADER);
        grid.addAll(rows);
        return new Result(grid, buildTip(pages, ocr, truncated, rows.size(), skipped), pages, rows.size(), skipped);
    }

    // ================================================================= 单行解析

    static Entry parseLine(String line) {
        if (isHeader(line)) {
            return null;
        }
        String s = stripLeadingNumber(line);

        Matcher m = ENTRY.matcher(s);
        if (!m.matches()) {
            return null;   // 行首不是英文：页码、章节标题、纯中文说明
        }
        String word = m.group(1).strip();
        String rest = m.group(2);

        // 单词末尾挂着词性缩写（OCR 吃掉点号的 "adj"）时剪掉，别让它进单词列
        if (word.indexOf(' ') > 0) {
            String[] toks = word.split("\\s+");
            int cut = toks.length;
            while (cut > 1 && POS_WORDS.contains(toks[cut - 1].toLowerCase(Locale.ROOT))) {
                cut--;
            }
            if (cut < toks.length) {
                word = String.join(" ", java.util.Arrays.copyOfRange(toks, 0, cut));
            }
        }

        // 音标可能出现两个（英式 + 美式），留第一个给"音标"列
        String phonetic = "";
        for (int i = 0; i < 2; i++) {
            Matcher p = PHONETIC.matcher(rest);
            if (!p.find()) {
                break;
            }
            if (phonetic.isEmpty()) {
                phonetic = p.group().strip();
            }
            rest = rest.substring(p.end());
        }

        Matcher pos = POS.matcher(rest);
        if (pos.find()) {
            rest = rest.substring(pos.end());
        }

        String meaning = LEAD_SEP.matcher(rest).replaceFirst("");
        meaning = TRAIL_REF.matcher(meaning).replaceFirst("").strip();

        // 没有中文就不是词条：单靠英文的残行（页眉 "Unit 3 Vocabulary"）只会造出脏题
        if (meaning.isEmpty() || !CJK.matcher(meaning).find()) {
            return null;
        }
        if (word.length() > 30 || meaning.length() > 100) {
            return null;
        }
        return new Entry(word, meaning, phonetic);
    }

    /**
     * 剥掉行首序号。
     *
     * <p>剥完必须紧跟英文字母才认，否则 {@code "3500 词汇"} 这种标题会被剥成
     * {@code "词汇"}，反而绕过了后面的"必须英文开头"判断。</p>
     */
    private static String stripLeadingNumber(String line) {
        Matcher m = LEADING_NO.matcher(line);
        if (!m.find()) {
            return line;
        }
        String after = line.substring(m.end());
        if (!after.isEmpty() && Character.isLetter(after.charAt(0)) && after.charAt(0) < 128) {
            return after;
        }
        return line;
    }

    private static boolean isHeader(String line) {
        if (line.contains("单词") && (line.contains("释义") || line.contains("中文") || line.contains("意思"))) {
            return true;
        }
        if (line.contains("音标") && line.contains("英文")) {
            return true;
        }
        // 纯英文表头：Word / Meaning / Phonetic / Translation / Vocabulary
        return line.matches("(?i)^(word|vocabulary|glossary|new\\s+words?)\\b.*"
                + "(meaning|translation|phonetic|pronunciation|中文|释义).*$");
    }

    // ================================================================= 文案

    private static String buildTip(int pages, boolean ocr, boolean truncated, int entries, int skipped) {
        StringBuilder sb = new StringBuilder();
        sb.append(ocr ? "扫描件 OCR：" : "PDF：").append(pages).append(" 页，");
        if (ocr) {
            sb.append("整页是图片，已做文字识别；");
        }
        sb.append("认出 ").append(entries).append(" 条「单词 + 释义」");
        if (skipped > 0) {
            sb.append("，另有 ").append(skipped).append(" 行没有中文释义（页眉、页码或纯英文行），已忽略");
        }
        if (truncated) {
            sb.append("。页数超过单次识别上限，只处理了前若干页");
        }
        sb.append("。选项 A~D 留空，导入时会自动生成干扰项。");
        return sb.toString();
    }

    private static BizException noEntryError(boolean ocr, int skipped) {
        if (ocr) {
            return BizException.badRequest("这份扫描件里没有认出「单词 + 释义」条目（共 " + skipped
                    + " 行，都没有中文释义）。扫描件的单词表排版较密时识别率会下降，"
                    + "可以先在预览里核对，或改用 Excel/CSV 模板填写。");
        }
        return BizException.badRequest("这份 PDF 里没有认出「单词 + 释义」条目。"
                + "单词表一般是「abandon /əˈbændən/ v. 放弃；抛弃」这样一行一条，英文在前、中文在后；"
                + "如果文件里只有单词、没有中文释义，系统无法生成选项，建议改用 Excel/CSV 模板填写。");
    }
}
