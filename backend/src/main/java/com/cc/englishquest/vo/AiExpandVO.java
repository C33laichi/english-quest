package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 语法知识点拓展结果
 */
@Data
public class AiExpandVO {

    private Long questionId;

    /** 考点名称 */
    private String knowledgePoint;

    private String stem;

    private String correctAnswer;

    /** 原题解析（作为对照） */
    private String analysis;

    /** AI 拓展的讲解正文 */
    private String content;

    /** 数据来源：MOCK / LLM / FALLBACK */
    private String source;
}
