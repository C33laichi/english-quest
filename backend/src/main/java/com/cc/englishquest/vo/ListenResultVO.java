package com.cc.englishquest.vo;

import lombok.Data;

import java.util.List;

/**
 * 听力听写关卡结算结果
 */
@Data
public class ListenResultVO {

    private Long levelId;

    private String levelName;

    /** EASY / HARD */
    private String mode;

    /** 关卡总分 0~100 */
    private Integer score;

    private Integer passScore;

    private Boolean passed;

    /** 是否因此解锁了下一关 */
    private Boolean unlockNext;

    private Integer correctCount;

    private Integer totalCount;

    /** 平均词级准确率 */
    private Double avgAccuracy;

    /** 星级 0~3 */
    private Integer stars;

    private Integer gainPoints;

    private Boolean newRecord;

    /** 逐句回顾 */
    private List<ItemVO> details;

    @Data
    public static class ItemVO {
        private Long sentenceId;
        private String english;
        private String chinese;
        private String userAnswer;
        /** 是否查看过答案（查看后本题不计分） */
        private Boolean revealed;
        private Double accuracy;
        private Boolean correct;
        private Integer matchedCount;
        private Integer totalWords;
        private Integer score;
    }
}
