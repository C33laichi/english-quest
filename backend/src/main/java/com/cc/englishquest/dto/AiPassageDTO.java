package com.cc.englishquest.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * 单词串烧（词汇错题多选 → 生成短文）请求
 */
@Data
public class AiPassageDTO {

    /** 勾选的错题 id；至少 2 个才有"串起来"的意义 */
    @NotEmpty(message = "请至少勾选两个单词")
    @Size(min = 2, max = 12, message = "一次可选 2~12 个单词")
    private List<Long> errorIds;
}
