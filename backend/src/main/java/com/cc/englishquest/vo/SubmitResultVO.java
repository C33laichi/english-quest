package com.cc.englishquest.vo;

import lombok.Data;

import java.util.List;

/**
 * 闯关结算结果
 */
@Data
public class SubmitResultVO {

    /** 本次得分（百分制） */
    private Integer score;

    private Integer correctCount;

    private Integer totalCount;

    /** 星级 0~3 */
    private Integer stars;

    private Integer passScore;

    private Boolean passed;

    /** 是否解锁了下一关 */
    private Boolean unlockNext;

    /** 本次获得积分 */
    private Integer gainPoints;

    /** 本次是否为历史最高分 */
    private Boolean newRecord;

    /** 错题明细 */
    private List<WrongItem> wrongQuestions;

    @Data
    public static class WrongItem {
        private Long questionId;
        private String stem;

        /** 用户所选选项的 key（A/B/C/D），保留给需要按 key 做逻辑的地方 */
        private String userAnswer;
        /** 正确答案的 key（A/B/C/D） */
        private String correctAnswer;

        /*
         * 选项**内容**。回顾错题时只给 A/B/C/D 没有意义 ——
         * 用户记不住"A 是哪个"，必须直接把选项文本摆出来才能对照。
         * 前端优先渲染这两个字段，key 仅作降级兜底。
         */
        /** 用户所选项的完整文本，如 "an"；未作答时为空串 */
        private String userAnswerText;
        /** 正确选项的完整文本，如 "the, /" */
        private String correctAnswerText;

        private String analysis;
    }
}
