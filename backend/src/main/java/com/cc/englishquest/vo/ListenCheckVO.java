package com.cc.englishquest.vo;

import lombok.Data;

import java.util.List;

/**
 * 单句听写判分结果
 */
@Data
public class ListenCheckVO {

    private Long sentenceId;

    /** 是否完全正确（逐词全对且无多余词） */
    private Boolean correct;

    /** 词级准确率 0~1 */
    private Double accuracy;

    /** 匹配上的单词数 */
    private Integer matchedCount;

    /** 正确答案的单词总数 */
    private Integer totalWords;

    /** 本题得分（0~10） */
    private Integer score;

    /** 英文原句（判分后才返回） */
    private String correctAnswer;

    /** 中文译文 */
    private String chinese;

    /** 用户输入逐词对照，用于前端红绿着色 */
    private List<WordVO> userWords;

    /** 正确答案逐词对照 */
    private List<WordVO> answerWords;

    @Data
    public static class WordVO {
        private String text;
        private Boolean matched;

        public WordVO() {
        }

        public WordVO(String text, Boolean matched) {
            this.text = text;
            this.matched = matched;
        }
    }
}
