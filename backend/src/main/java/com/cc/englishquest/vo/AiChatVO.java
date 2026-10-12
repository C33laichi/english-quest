package com.cc.englishquest.vo;

import lombok.Data;

/**
 * AI 对话回复
 *
 * <p>对话**不做本地降级**：没有 Key 时接口直接拒绝，调用失败也直接报错。
 * 原因是本地生成不了可信的对话内容 —— 编一段话冒充「AI 的回答」
 * 会让学生把机器造的句子当成模型给的，比报错更糟。</p>
 */
@Data
public class AiChatVO {

    /** 模型回复正文 */
    private String reply;

    /** 数据来源，只会是 LLM */
    private String source;

    /** 今日剩余对话次数；-1 表示不限次数 */
    private Integer remainingQuota;
}
