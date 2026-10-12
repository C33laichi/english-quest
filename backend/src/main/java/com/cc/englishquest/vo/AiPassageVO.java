package com.cc.englishquest.vo;

import lombok.Data;

import java.util.List;

/**
 * 单词串烧结果：把勾选的若干单词编成一篇短文
 */
@Data
public class AiPassageVO {

    /** 本次用到的单词（按勾选顺序） */
    private List<String> words;

    /** 短文标题 */
    private String title;

    /** 短文正文（英文） */
    private String content;

    /** 正文中文参考译文（Mock 可能为空） */
    private String translation;

    /** 数据来源：MOCK / LLM / FALLBACK */
    private String source;
}
