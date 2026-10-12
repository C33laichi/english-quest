package com.cc.englishquest.vo;

import lombok.Data;

import java.util.List;

/**
 * 练习阶段下发的句子（绝不含英文原句）
 *
 * 反作弊说明：困难模式不下发 wordLens / wordCount，
 * 使答案无法从前端网络响应中推断出来。
 */
@Data
public class ListenSentenceVO {

    private Long id;

    /** 中文译文提示 */
    private String chinese;

    /** 单词数，仅简单模式下发 */
    private Integer wordCount;

    /** 每个单词的字母数，仅简单模式下发；困难模式为 null */
    private List<Integer> wordLens;
}
