package com.cc.englishquest.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 单句听写判分请求
 */
@Data
public class ListenCheckDTO {

    @NotNull(message = "句子ID不能为空")
    private Long sentenceId;

    private String userAnswer;

    /** EASY / HARD，影响提示下发与积分系数 */
    private String mode = "EASY";
}
