package com.cc.englishquest.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * AI 对话请求
 *
 * <p>对话历史由前端持有并随请求带上，服务端不落库、不维护会话 ——
 * 这样弹窗关掉即结束，不留会话垃圾，也不需要新增会话表。</p>
 */
@Data
public class AiChatDTO {

    /** 本轮提问 */
    @NotBlank(message = "请输入要问的内容")
    @Size(max = 500, message = "单条提问不超过 500 字")
    private String message;

    /**
     * 历史轮次（不含本轮）。服务端只取最近若干轮，
     * 前端即使把整段历史都传上来也不会把请求撑爆。
     */
    @Valid
    @Size(max = 40, message = "历史轮次过多")
    private List<Turn> history;

    /** 一轮对话 */
    @Data
    public static class Turn {

        /** 只允许 user / assistant —— system 提示由服务端拼，不接受前端注入 */
        @NotBlank(message = "角色不能为空")
        private String role;

        @NotBlank(message = "内容不能为空")
        @Size(max = 2000, message = "单条内容不超过 2000 字")
        private String content;
    }
}
