package com.cc.englishquest.dto;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 语法知识点拓展请求
 */
@Data
public class AiExpandDTO {

    /** 错题本记录 id（由它定位到语法题与考点） */
    @NotNull(message = "错题ID不能为空")
    private Long errorId;
}
