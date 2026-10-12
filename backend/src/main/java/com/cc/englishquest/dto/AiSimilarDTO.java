package com.cc.englishquest.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class AiSimilarDTO {

    @NotNull(message = "错题ID不能为空")
    private Long errorId;
}
