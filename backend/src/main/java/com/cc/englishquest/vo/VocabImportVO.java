package com.cc.englishquest.vo;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 词汇题库批量导入的结果 / 预览。
 *
 * <p>同一个对象既用于「解析预览」（dryRun=true）也用于「真正导入」，
 * 这样前端拿到两种结果可以走同一套渲染逻辑 —— 预览时 {@code dryRun} 为 true、
 * {@code inserted} 为 0，只有 {@code insertable} 有意义。</p>
 */
@Data
public class VocabImportVO {

    /** 文件里识别到的数据行数（不含表头与整行空白） */
    private int total;

    /** 校验通过、且不与题库/本文件重复的行数（预览时即"将要导入"的条数） */
    private int insertable;

    /** 实际写库条数（预览恒为 0） */
    private int inserted;

    /** 因重复被跳过的行数 */
    private int skipped;

    /** 校验不通过的行数 */
    private int failed;

    /** 是否为解析预览（未写库） */
    private boolean dryRun;

    /**
     * PDF 导入时的识别摘要：多少页、是不是扫描件、认出多少条、忽略了多少行。
     *
     * <p>只对 PDF 有值，Excel / CSV 为 null —— 表格文件的列名本身就是"识别结果"，
     * 不需要再解释一遍。</p>
     */
    private String tip;

    /** 前若干行的解析结果，供管理员核对 */
    private List<Row> preview = new ArrayList<>();

    /** 出错行明细 */
    private List<RowError> errors = new ArrayList<>();

    /** 被跳过的行明细（重复） */
    private List<RowError> skippedRows = new ArrayList<>();

    /** 解析出来的一行题目 */
    @Data
    public static class Row {
        /** 在原文件里的行号（从 1 开始，含表头） */
        private int rowNo;
        private String type;
        private String word;
        private String meaning;
        private String optionA;
        private String optionB;
        private String optionC;
        private String optionD;
        private String answer;
        /** 选项是否由系统自动生成 */
        private boolean autoOptions;
        /** 补充说明（如"拼写题答案固定为单词本身"） */
        private String note;
    }

    /** 一行的问题说明 */
    @Data
    public static class RowError {
        private int rowNo;
        private String message;

        public RowError() {
        }

        public RowError(int rowNo, String message) {
            this.rowNo = rowNo;
            this.message = message;
        }
    }
}
