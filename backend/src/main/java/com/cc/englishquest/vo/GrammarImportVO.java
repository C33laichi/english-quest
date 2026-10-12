package com.cc.englishquest.vo;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 语法题库批量导入的结果 / 预览。
 *
 * <p>与 {@link VocabImportVO} 结构刻意保持一致（同一套前端渲染逻辑），
 * 但行的内容不同：语法题是"题干 + 4 个选项 + 答案"，且**每行可以指定自己的 Day**。</p>
 */
@Data
public class GrammarImportVO {

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

    /** 本次涉及的 Day 数量（写库后用于回显"影响了几天的题"） */
    private int lessonCount;

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
        /** 落库后的所属 Day 序号 */
        private Integer dayNo;
        /** 所属讲义标题 */
        private String lessonTitle;
        private String type;
        private String stem;
        private String optionA;
        private String optionB;
        private String optionC;
        private String optionD;
        private String answer;
        private String knowledgePoint;
        private String analysis;
        /** 补充说明（如"沿用所选 Day"、"知识点按讲义标题补全"、"解析自动补全"） */
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
