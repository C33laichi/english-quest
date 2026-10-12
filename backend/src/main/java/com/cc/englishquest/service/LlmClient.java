package com.cc.englishquest.service;

import cn.hutool.http.HttpRequest;
import cn.hutool.http.HttpResponse;
import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

/**
 * 大语言模型客户端（OpenAI 兼容协议）
 *
 * <p>配置 app.ai.mock=true 时不发起真实请求（由 AiService 走本地 Mock 分支）；
 * 配置为 false 并且填好 api-key 后即切换为真实调用，业务代码无需改动。</p>
 */
@Slf4j
@Component
public class LlmClient {

    @Value("${app.ai.base-url}")
    private String baseUrl;

    @Value("${app.ai.api-key:}")
    private String apiKey;

    @Value("${app.ai.model}")
    private String model;

    @Value("${app.ai.timeout-ms:15000}")
    private int timeoutMs;

    @Value("${app.ai.mock:true}")
    private boolean mock;

    public boolean isMock() {
        return mock || apiKey == null || apiKey.isBlank();
    }

    /** 真实大模型是否可用（= 没走离线模式）。所有依赖在线模型的能力都应先问它 */
    public boolean isAvailable() {
        return !isMock();
    }

    /**
     * 不可用原因；可用时返回 null。
     *
     * <p>只描述「为什么不可用」，**绝不回显 api-key 本身** ——
     * 这个字符串会经接口原样返回给前端。</p>
     */
    public String unavailableReason() {
        if (isAvailable()) {
            return null;
        }
        // 先判 mock 开关：Key 填了但开关关掉时，原因说「离线模式」才准确
        if (mock) {
            return "服务端已切换为离线模式（app.ai.mock=true）";
        }
        return "服务端未配置 API Key";
    }

    /** 当前模型名（可安全展示给前端） */
    public String model() {
        return model;
    }

    /** 单轮调用（原有调用方无需改动） */
    public String chat(String prompt) {
        JSONArray messages = new JSONArray();
        messages.add(chatMessage("user", prompt));
        return chat(messages);
    }

    /** 构造一条 messages 元素，供多轮对话复用 */
    public Map<String, Object> chatMessage(String role, String content) {
        Map<String, Object> message = new HashMap<>();
        message.put("role", role);
        message.put("content", content);
        return message;
    }

    /**
     * 多轮对话。messages 形如 [{role: system|user|assistant, content: ...}]，
     * 由调用方拼好「system 提示 + 历史轮次 + 本轮提问」。
     *
     * @return 模型返回的文本内容
     */
    public String chat(JSONArray messages) {
        if (isMock()) {
            throw new IllegalStateException("Mock 模式下不调用真实大模型");
        }

        JSONObject payload = new JSONObject();
        payload.set("model", model);
        payload.set("messages", messages);
        payload.set("temperature", 0.7);
        payload.set("stream", false);

        try (HttpResponse response = HttpRequest.post(baseUrl)
                .header("Content-Type", "application/json")
                .header("Authorization", "Bearer " + apiKey)
                .timeout(timeoutMs)
                .body(payload.toString())
                .execute()) {
            if (!response.isOk()) {
                throw new IllegalStateException("大模型接口返回异常：" + response.getStatus());
            }
            JSONObject body = JSONUtil.parseObj(response.body());
            return body.getJSONArray("choices").getJSONObject(0)
                    .getJSONObject("message").getStr("content");
        } catch (Exception e) {
            log.error("调用大模型失败", e);
            throw new IllegalStateException("大模型服务暂时不可用：" + e.getMessage());
        }
    }

    /** 从模型返回文本中提取 JSON（兼容 ```json 代码块包裹） */
    public JSONObject extractJson(String text) {
        if (text == null) {
            return null;
        }
        String cleaned = text.trim();
        int start = cleaned.indexOf('{');
        int end = cleaned.lastIndexOf('}');
        if (start < 0 || end <= start) {
            return null;
        }
        try {
            return JSONUtil.parseObj(cleaned.substring(start, end + 1));
        } catch (Exception e) {
            return null;
        }
    }
}
