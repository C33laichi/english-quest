package com.cc.englishquest.common;

import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;

import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * PDF 纯文本抽取（薄封装，只做"字节 -> 文字"，不懂任何题目结构）。
 *
 * <p>为什么不再自己造轮子：PDF 的文字是画在页面上的字形序列，要还原成可读字符
 * 必须解析字体里的 {@code ToUnicode} CMap、处理 {@code FlateDecode} 压缩流、
 * 还要按坐标把碎片拼成行。中文字体尤其如此（一个汉字常被拆成多个 Tj 片段）。
 * PDFBox 已经把这几件事做完了，自己写只会在"某些字体下抽出乱码"上反复踩坑。</p>
 *
 * <p><b>局限（必须在业务层兜住）</b>：扫描件（整页是一张图片）没有文字层，
 * 抽出来只有零星几个页码数字，这种情况只能靠 OCR，本类无能为力 ——
 * 调用方要用 {@link #textPerPage()} 之类的指标判断并给出明确提示，
 * 而不是让用户对着一份"导入 0 条"的结果发呆。</p>
 */
@Slf4j
public final class PdfText {

    /** PDF 文件头：{@code %PDF-} */
    private static final byte[] MAGIC = {'%', 'P', 'D', 'F'};

    static {
        // PDFBox 首次运行会扫描系统字体并刷屏打 WARN（"364 new fonts found"之类），
        // 那是它自己的字体缓存机制，与业务无关。提到 SEVERE 免得把真正的错误淹掉。
        Logger.getLogger("org.apache.pdfbox").setLevel(Level.SEVERE);
        Logger.getLogger("org.apache.fontbox").setLevel(Level.SEVERE);
    }

    private PdfText() {
    }

    /** 结果：页数 + 全文（行之间用 {@code \n}，无页眉页脚概念） */
    public record Extracted(int pages, String text) {

        /** 平均每页字数：扫描件通常只有个位数（页码），文字版在几百以上 */
        public double textPerPage() {
            return pages <= 0 ? text.length() : (double) text.length() / pages;
        }
    }

    /** 按魔数判断（不信扩展名：管理员把 .pdf 改名成 .txt 也该照样认出来） */
    public static boolean isPdf(byte[] bytes) {
        if (bytes == null || bytes.length < MAGIC.length) {
            return false;
        }
        for (int i = 0; i < MAGIC.length; i++) {
            if (bytes[i] != MAGIC[i]) {
                return false;
            }
        }
        return true;
    }

    public static Extracted extract(byte[] bytes) {
        long start = System.currentTimeMillis();
        try (PDDocument doc = PDDocument.load(bytes)) {
            PDFTextStripper stripper = new PDFTextStripper();
            // 按坐标排序，否则同一行被拆成多段时顺序会乱（中英文混排尤其明显）
            stripper.setSortByPosition(true);
            String text = stripper.getText(doc);
            log.debug("PDF 抽取完成：{} 页 / {} 字 / {}ms",
                    doc.getNumberOfPages(), text.length(), System.currentTimeMillis() - start);
            return new Extracted(doc.getNumberOfPages(), text);
        } catch (Exception e) {
            log.warn("PDF 解析失败：{}", e.getMessage());
            throw BizException.badRequest("PDF 打不开：文件可能已损坏，或者设置了打开密码");
        }
    }
}
