package com.cc.englishquest.common;

import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.Charset;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 表格类上传文件（.xlsx / .xls / .csv）的读取、解码与表头归一化。
 *
 * <p>词汇批量导入与语法批量导入共用这一份。两个功能的差别只在"列别名表"和
 * "逐行校验规则"，而**编解码、分隔符嗅探、表头归一化这些地方必须只有一处实现** ——
 * 它们是静默出错的重灾区（例如用宽松 UTF-8 去解 GBK 字节不会抛异常，
 * 只会得到一串乱码，并且能一路写进数据库，事后极难追查）。</p>
 *
 * <p>刻意不引第三方 CSV 库：RFC4180 就那几条规则（{@code ""} 转义、引号内可含
 * 换行与分隔符），自己写反而更好控制"猜错分隔符"这类边界。</p>
 */
@Slf4j
public final class SheetReader {

    /** 单次导入的数据行上限：再多就应该分批，否则一次请求过长、失败后无从定位 */
    public static final int MAX_ROWS = 500;
    /** 预览返回的行数（太多前端表格刷不动；错误明细则全量返回） */
    public static final int PREVIEW_ROWS = 10;

    private SheetReader() {
    }

    // ================================================================= 读文件

    /**
     * 把上传文件读成"行 × 列"的字符串网格（不含任何业务校验）。
     *
     * <p>**内容优先于扩展名**：xlsx 是 zip（前两字节 {@code PK}）、老式 xls 是 OLE
     * 复合文档（{@code D0CF11E0}），先按魔数判定，这样管理员把文件改了名也照样能读。</p>
     */
    public static List<List<String>> read(MultipartFile file) {
        byte[] bytes;
        try {
            bytes = file.getBytes();
        } catch (IOException e) {
            throw BizException.badRequest("读取上传文件失败，请重新选择文件");
        }
        if (bytes.length == 0) {
            throw BizException.badRequest("上传的文件是空的");
        }
        if (startsWith(bytes, new byte[]{'P', 'K'})
                || startsWith(bytes, new byte[]{(byte) 0xD0, (byte) 0xCF, 0x11, (byte) 0xE0})) {
            return readExcel(bytes);
        }
        String name = file.getOriginalFilename() == null
                ? "" : file.getOriginalFilename().toLowerCase(Locale.ROOT);
        if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
            // 扩展名说是 Excel、内容却不是：交给 POI 去报错，比当成文本乱解清楚
            return readExcel(bytes);
        }
        if (name.endsWith(".csv") || name.endsWith(".txt") || name.isEmpty() || name.endsWith(".text")) {
            return readCsv(bytes);
        }
        throw BizException.badRequest("只支持 .xlsx / .xls / .csv / .pdf 文件，当前是「"
                + file.getOriginalFilename() + "」");
    }

    private static boolean startsWith(byte[] data, byte[] head) {
        if (data.length < head.length) {
            return false;
        }
        for (int i = 0; i < head.length; i++) {
            if (data[i] != head[i]) {
                return false;
            }
        }
        return true;
    }

    private static List<List<String>> readExcel(byte[] bytes) {
        try (Workbook wb = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            Sheet sheet = wb.getSheetAt(0);
            if (sheet == null) {
                throw BizException.badRequest("Excel 里没有工作表");
            }
            DataFormatter fmt = new DataFormatter();
            List<List<String>> grid = new ArrayList<>();
            for (int r = 0; r <= sheet.getLastRowNum(); r++) {
                Row row = sheet.getRow(r);
                List<String> cells = new ArrayList<>();
                if (row != null) {
                    short last = row.getLastCellNum();
                    for (int c = 0; c < Math.max(last, 0); c++) {
                        Cell cell = row.getCell(c, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                        cells.add(cell == null ? "" : fmt.formatCellValue(cell).trim());
                    }
                }
                grid.add(cells);
            }
            return grid;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Excel 解析失败：{}", e.getMessage());
            throw BizException.badRequest("Excel 文件解析失败，请确认文件没有损坏、也没有设密码");
        }
    }

    private static List<List<String>> readCsv(byte[] bytes) {
        String text = decode(bytes);
        // 统一换行，后续按 '\n' 切行；引号里的 CRLF 也一并归一
        text = text.replace("\r\n", "\n").replace('\r', '\n');
        char delimiter = sniffDelimiter(text);
        List<List<String>> grid = new ArrayList<>();
        List<String> cur = new ArrayList<>();
        StringBuilder cellBuf = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (inQuotes) {
                if (ch == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        cellBuf.append('"');
                        i++;                    // 转义的双引号 "" -> "
                    } else {
                        inQuotes = false;
                    }
                } else {
                    cellBuf.append(ch);
                }
            } else if (ch == '"') {
                inQuotes = true;
            } else if (ch == delimiter) {
                cur.add(cellBuf.toString().trim());
                cellBuf.setLength(0);
            } else if (ch == '\n') {
                cur.add(cellBuf.toString().trim());
                cellBuf.setLength(0);
                grid.add(cur);
                cur = new ArrayList<>();
            } else {
                cellBuf.append(ch);
            }
        }
        if (cellBuf.length() > 0 || !cur.isEmpty()) {
            cur.add(cellBuf.toString().trim());
            grid.add(cur);
        }
        return grid;
    }

    /**
     * 猜分隔符：取第一行，看逗号 / 制表符 / 分号哪个多。
     *
     * <p>Excel 在中文环境「另存为 CSV」用的是逗号，但从别的系统导出的制表符文本
     * 也很常见，嗅探一下比要求用户改文件友好。</p>
     */
    private static char sniffDelimiter(String text) {
        int end = text.indexOf('\n');
        String first = end < 0 ? text : text.substring(0, end);
        int comma = 0;
        int tab = 0;
        int semi = 0;
        boolean inQuotes = false;
        for (int i = 0; i < first.length(); i++) {
            char ch = first.charAt(i);
            if (ch == '"') {
                inQuotes = !inQuotes;
            } else if (!inQuotes) {
                if (ch == ',') {
                    comma++;
                } else if (ch == '\t') {
                    tab++;
                } else if (ch == ';') {
                    semi++;
                }
            }
        }
        if (tab > comma && tab >= semi) {
            return '\t';
        }
        if (semi > comma && semi > tab) {
            return ';';
        }
        return ',';
    }

    /**
     * 解码上传的文本。
     *
     * <p>顺序：UTF-8 BOM → <b>严格</b> UTF-8 → GBK → 都失败才报错。
     * 必须"严格"解码再回退：用宽松 UTF-8 解 GBK 字节不会报错、只会得到一堆乱码，
     * 而且能一路写进数据库。</p>
     */
    private static String decode(byte[] bytes) {
        int offset = 0;
        if (bytes.length >= 3 && (bytes[0] & 0xFF) == 0xEF
                && (bytes[1] & 0xFF) == 0xBB && (bytes[2] & 0xFF) == 0xBF) {
            offset = 3;
        }
        String utf8 = tryDecode(bytes, offset, StandardCharsets.UTF_8);
        if (utf8 != null) {
            return utf8;
        }
        String gbk = tryDecode(bytes, offset, Charset.forName("GBK"));
        if (gbk != null) {
            return gbk;
        }
        throw BizException.badRequest("无法识别文件的文字编码，请另存为 UTF-8 或 GBK 的 CSV 后重试");
    }

    private static String tryDecode(byte[] bytes, int offset, Charset cs) {
        try {
            return cs.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes, offset, bytes.length - offset))
                    .toString();
        } catch (CharacterCodingException e) {
            return null;
        }
    }

    // ================================================================= 表头与取值

    public static int firstNonBlankRow(List<List<String>> grid) {
        for (int i = 0; i < grid.size(); i++) {
            if (!isRowBlank(grid.get(i))) {
                return i;
            }
        }
        return -1;
    }

    public static boolean isRowBlank(List<String> cells) {
        for (String c : cells) {
            if (c != null && !c.isBlank()) {
                return false;
            }
        }
        return true;
    }

    /**
     * 把表头行映射成「内部字段名 → 列下标」。缺必需列直接抛 400。
     *
     * <p>刻意**不猜列序**：猜错列序会把数据静默写错位，比直接报错糟得多。</p>
     *
     * @param alias     表头别名表（查表前会做 NFKC + 去空白 + 转小写）
     * @param required  <b>内部字段名 → 给人看的列名</b>，按顺序写。
     *                  用显示名拼错误提示（"缺少「题干」列：必须同时有…"），
     *                  用内部名判存在性 —— 两者的区别见 VocabImportService 的别名表。
     * @param optionalHint 可选列提示，直接拼进错误消息（可为空串）
     */
    public static Map<String, Integer> mapHeader(List<String> headerRow, Map<String, String> alias,
                                                Map<String, String> required, String optionalHint) {
        Map<String, Integer> col = new LinkedHashMap<>();
        for (int i = 0; i < headerRow.size(); i++) {
            String field = alias.get(normHeader(headerRow.get(i)));
            if (field != null) {
                col.putIfAbsent(field, i);   // 同名列只认第一个
            }
        }
        for (Map.Entry<String, String> req : required.entrySet()) {
            if (!col.containsKey(req.getKey())) {
                throw BizException.badRequest("表头里缺少「" + req.getValue() + "」列：必须同时有「"
                        + String.join("」、「", required.values()) + "」这 " + required.size() + " 列"
                        + optionalHint
                        + "。如果第一行不是表头，请在文件最上面补一行表头。");
            }
        }
        return col;
    }

    /** 表头归一化：NFKC（全角转半角）+ 去掉所有空白 + 转小写 */
    public static String normHeader(String raw) {
        if (raw == null) {
            return "";
        }
        return Normalizer.normalize(raw, Normalizer.Form.NFKC)
                .replaceAll("\\s+", "")
                .toLowerCase(Locale.ROOT);
    }

    /** 比对用归一化：NFKC + 去空白 + 小写（"ＡＢＣ" / "abc " / "ABC" 视为同一个） */
    public static String normKey(String s) {
        if (s == null) {
            return "";
        }
        return Normalizer.normalize(s, Normalizer.Form.NFKC)
                .replaceAll("\\s+", "")
                .toLowerCase(Locale.ROOT);
    }

    /** 按下标安全取值（下标可能为 null、越界） */
    public static String cell(List<String> cells, Integer idx) {
        if (idx == null || idx < 0 || idx >= cells.size()) {
            return "";
        }
        String v = cells.get(idx);
        return v == null ? "" : v.trim();
    }

    /** 空串归一成 null（写库时用，避免把 "" 存进去） */
    public static String blankToNull(String s) {
        return (s == null || s.isBlank()) ? null : s;
    }
}
