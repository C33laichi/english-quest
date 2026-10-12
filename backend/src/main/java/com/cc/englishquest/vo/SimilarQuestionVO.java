package com.cc.englishquest.vo;

import lombok.Data;

import java.util.List;

/**
 * AI 生成的同型题
 */
@Data
public class SimilarQuestionVO {

    private String stem;

    private List<String> options;

    private String answer;

    private String analysis;

    private String knowledgePoint;

    /** 今日剩余调用次数 */
    private Integer remainingQuota;

    /** 数据来源：MOCK / LLM */
    private String source;
}
