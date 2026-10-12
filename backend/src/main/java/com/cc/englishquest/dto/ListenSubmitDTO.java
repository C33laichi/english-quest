package com.cc.englishquest.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * 听力听写关卡提交
 *
 * 前端只上报「用户输入了什么」，得分一律由服务端重新判算，
 * 避免前端伪造 correct 字段刷分。
 */
@Data
public class ListenSubmitDTO {

    /** EASY / HARD */
    private String mode = "EASY";

    /** 本次练习总耗时（秒） */
    private Integer costTime;

    @NotNull(message = "答题内容不能为空")
    private List<AnswerItem> answers;

    @Data
    public static class AnswerItem {
        private Long sentenceId;
        private String userAnswer;
        /** 本题播放次数 */
        private Integer playedTimes;
        /** 是否查看过答案 */
        private Boolean revealed;
    }
}
