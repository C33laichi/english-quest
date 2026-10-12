package com.cc.englishquest.vo;

import lombok.Data;

/**
 * AI 能力可用性状态
 *
 * <p>给前端判断「AI 对话能不能用」以及为什么不能用。
 * <b>只暴露可用性与模型名，不含 api-key / base-url。</b></p>
 */
@Data
public class AiStatusVO {

    /** AI 对话是否可用（服务端已配置真实大模型时才为 true） */
    private Boolean chatAvailable;

    /** 不可用原因；可用时为 null。直接展示给学生，所以是中文自然语言 */
    private String reason;

    /** 当前模型名；不可用时为 null */
    private String model;

    /** 今日剩余对话次数；-1 表示不限次数 */
    private Integer remaining;
}
