package com.cc.englishquest.vo;

import lombok.Data;

import java.util.List;

/**
 * 题目视图（不含答案，防止前端作弊）
 */
@Data
public class QuestionVO {

    private Long id;

    /** CHOICE / SPELL / FILL */
    private String type;

    /** 题干（词汇题为单词，语法题为句子） */
    private String stem;

    /** 音标（词汇题） */
    private String phonetic;

    /** 中文提示（拼写题使用） */
    private String hint;

    private List<String> options;

    /** 选项字母与内容映射，如 A -> 选项内容 */
    private List<OptionVO> optionList;

    @Data
    public static class OptionVO {
        private String key;
        private String value;

        public OptionVO(String key, String value) {
            this.key = key;
            this.value = value;
        }
    }
}
