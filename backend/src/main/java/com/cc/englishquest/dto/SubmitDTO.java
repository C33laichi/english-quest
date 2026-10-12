package com.cc.englishquest.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.List;

/**
 * 答题提交
 */
@Data
public class SubmitDTO {

    /** 答题总耗时（秒） */
    private Integer costTime;

    @NotNull(message = "答题内容不能为空")
    private List<AnswerItem> answers;

    @Data
    public static class AnswerItem {
        private Long questionId;
        private String userAnswer;
    }
}
