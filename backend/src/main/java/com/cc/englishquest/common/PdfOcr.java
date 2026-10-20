package com.cc.englishquest.common;

import lombok.extern.slf4j.Slf4j;
import net.sourceforge.tess4j.Tesseract;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.ImageType;
import org.apache.pdfbox.rendering.PDFRenderer;

import java.awt.image.BufferedImage;
import java.io.File;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * 扫描件 PDF 的 OCR：把每页渲染成位图，交给 Tesseract 认字。
 *
 * <p><b>为什么要走到这一步</b>：有些题库 PDF 是"拍/扫出来的"，页面上只有一张图，
 * 没有文字层 —— {@link PdfText} 抽出来只有页码。这时候唯一的办法是图像识别。</p>
 *
 * <p><b>词库是必需的外部文件</b>：Tesseract 只带引擎，不带语言模型。
 * 中文需要 {@code chi_sim.traineddata}，英文需要 {@code eng.traineddata}，
 * 放在 {@code app.ocr.datapath} 指向的目录（默认后端目录下的 {@code tessdata}）。
 * 缺文件时 {@link #isAvailable} 返回 false，由业务层给出"未安装词库"的明确提示，
 * 而不是抛一个看不懂的 native 异常。</p>
 *
 * <p><b>线程安全</b>：Tesseract 实例内部持有 native 句柄，不可并发调用，
 * 这里用一把静态锁串行化。批量导入本来就是单用户操作，锁的代价可以接受。</p>
 */
@Slf4j
public final class PdfOcr {

    /** Tesseract 实例不能并发使用 */
    private static final Object LOCK = new Object();

    static {
        Logger.getLogger("net.sourceforge.tess4j").setLevel(Level.SEVERE);
    }

    private PdfOcr() {
    }

    /**
     * 识别参数。
     *
     * @param datapath 词库目录（含 *.traineddata）
     * @param lang     语言组合，如 {@code chi_sim+eng}
     * @param dpi      渲染精度：150~200 足够，太高只会变慢
     * @param maxPages 最多识别多少页（识别一页约 1~2 秒，不设上限会让请求超时）
     */
    public record Options(String datapath, String lang, int dpi, int maxPages) {

        public Options withDefaults() {
            return new Options(
                    datapath == null || datapath.isBlank() ? "tessdata" : datapath,
                    lang == null || lang.isBlank() ? "chi_sim+eng" : lang,
                    dpi <= 0 ? 180 : dpi,
                    maxPages <= 0 ? 40 : maxPages);
        }
    }

    /**
     * 识别结果。
     *
     * @param text      全文（各页之间用换行分隔）
     * @param pages     PDF 总页数
     * @param ocrPages  实际识别的页数（被 maxPages 截断时小于 pages）
     */
    public record Result(String text, int pages, int ocrPages) {

        public boolean truncated() {
            return ocrPages < pages;
        }
    }

    /**
     * 收拾 OCR 出来的文字：把"很宽的空白"还原成填空横线，顺手修几个常见误认。
     *
     * <p>规则只按行判断，因为选项行的宽空白是"两个选项之间的间距"，不能当横线：</p>
     * <ul>
     *   <li>选项行（{@code A. / B. ...} 开头）：压缩所有连续空白，交给解析器按字母切</li>
     *   <li>其他行：连续 4 个以上空格 → {@code ______}（填空横线的唯一痕迹）</li>
     * </ul>
     */
    static String normalizeOcrText(String raw) {
        StringBuilder out = new StringBuilder(raw.length());
        for (String line : raw.split("\n")) {
            String t = line.replace('\u00A0', ' ').replace("\u200B", "");
            if (t.isBlank()) {
                out.append('\n');
                continue;
            }
            if (OPTION_LINE.matcher(t.strip()).find()) {
                t = t.replaceAll("[ \t]{2,}", " ");
            } else {
                t = t.replaceAll("[ \t]{4,}", " ______ ");
                t = t.replaceAll("[ \t]{2,}", " ");
            }
            // 竖线当大写 I（"| think" / "when | saw"），题库里没有真的竖线
            t = t.replaceAll("(?<=[\\s,;:])[|](?=[\\sA-Za-z])", "I");
            out.append(t).append('\n');
        }
        return out.toString();
    }

    /** 选项行：A. / B、/ Ｃ．开头 */
    private static final java.util.regex.Pattern OPTION_LINE =
            java.util.regex.Pattern.compile("^[A-DＡ-Ｄａ-ｄ]\\s*[.．、,，)）:：]");

    /** 词库是否就绪（缺则说明这类文件暂时用不了，要给出安装提示） */
    public static boolean isAvailable(Options opts) {
        Options o = opts.withDefaults();
        File dir = new File(o.datapath());
        if (!dir.isDirectory()) {
            return false;
        }
        for (String lang : o.lang().split("\\+")) {
            if (!new File(dir, lang.trim() + ".traineddata").isFile()) {
                return false;
            }
        }
        return true;
    }

    /** 缺词库时给出的安装提示（文案负责"告诉用户下一步做什么"） */
    public static String missingDataHint(Options opts) {
        Options o = opts.withDefaults();
        return "扫描件需要 OCR 词库：" + new File(o.datapath()).getAbsolutePath()
                + " 下缺少 " + o.lang().replace("+", ".traineddata / ") + ".traineddata";
    }

    public static Result recognize(byte[] bytes, Options opts) {
        Options o = opts.withDefaults();
        long start = System.currentTimeMillis();
        try (PDDocument doc = PDDocument.load(bytes)) {
            int pages = doc.getNumberOfPages();
            int limit = Math.min(pages, o.maxPages());
            PDFRenderer renderer = new PDFRenderer(doc);

            Tesseract tess = new Tesseract();
            tess.setDatapath(o.datapath());
            tess.setLanguage(o.lang());
            // 关键：保留词间原始空格数。题库里的"填空横线"在图上是一条横线，
            // Tesseract 不认它，但会把它变成一个很宽的空白 —— 只有开了这个开关才留得住，
            // 后面 normalize 就能把它还原成 ______（否则题干会看起来像少了个词）。
            tess.setVariable("preserve_interword_spaces", "1");

            StringBuilder all = new StringBuilder();
            int done = 0;
            for (int i = 0; i < limit; i++) {
                try {
                    BufferedImage img = renderer.renderImageWithDPI(i, o.dpi(), ImageType.GRAY);
                    String text;
                    synchronized (LOCK) {
                        text = tess.doOCR(img);
                    }
                    all.append(normalizeOcrText(text)).append('\n');
                    done++;
                    if ((i + 1) % 5 == 0 || i + 1 == limit) {
                        log.info("OCR 进度 {}/{} 页", i + 1, limit);
                    }
                } catch (Exception e) {
                    // 单页失败不该让整份文件作废：跳过并继续，缺的题会在结果里体现
                    log.warn("第 {} 页 OCR 失败：{}", i + 1, e.getMessage());
                }
            }
            log.info("OCR 完成：{} 页 / {} 字 / {}ms", done, all.length(), System.currentTimeMillis() - start);
            return new Result(all.toString(), pages, done);
        } catch (Exception e) {
            log.warn("扫描件渲染失败：{}", e.getMessage());
            throw BizException.badRequest("扫描件处理失败：PDF 可能已损坏，或者页数过多");
        }
    }
}
