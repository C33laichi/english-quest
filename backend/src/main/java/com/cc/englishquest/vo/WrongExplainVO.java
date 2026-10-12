package com.cc.englishquest.vo;

import lombok.Data;

/**
 * 错题针对性讲解结果
 */
@Data
public class WrongExplainVO {

    private Long questionId;

    /** 学生所选的错项 key */
    private String chosen;
    /** 学生所选项的文本，便于前端回显「你选的是 …」 */
    private String chosenText;

    private String correctAnswer;
    private String correctAnswerText;

    /** 讲解正文 */
    private String content;

    /** LLM / MOCK / FALLBACK，前端据此决定要不要标注「示例讲解」 */
    private String source;

    /** 是否命中缓存（命中则不消耗配额） */
    private Boolean cached;

    /** 今日剩余讲解次数 */
    private Integer remainingQuota;
}
