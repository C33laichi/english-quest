package com.cc.englishquest.service;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import cn.hutool.json.JSONUtil;
import com.cc.englishquest.common.BizException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 用大模型给"没有答案的题目"补答案。
 *
 * <p>存在的理由：扫描件题库（每日刷题那一类）只印了题目，答案是视频里讲的，
 * PDF 里一个字都没有。OCR 能把题干和选项搬进系统，答案这一步只能有人"做一遍"——
 * 那就让模型来做，做完留在预览里让管理员抽查。</p>
 *
 * <p><b>必须让用户知道这是 AI 做的</b>：解析会带上「AI 作答」前缀，
 * 结果摘要也会写明补了多少条、建议抽查。绝不假装是题库原答案。</p>
 *
 * <p>为什么分批：一次塞 200 题，输出会超过 max_tokens 被截断，且错了没法定位。
 * 每批 12 题，失败只影响这一批。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class GrammarAiAnswerer {

    /** 解析结果的 AI 标记：一眼能看出这条解析不是题库自带的 */
    public static final String AI_TAG = "（AI 作答，建议抽查）";

    private static final Pattern LETTER = Pattern.compile("[ABCD]");

    private final LlmClient llmClient;

    /** 每次请求处理多少题 */
    @Value("${app.ai.answer-batch:12}")
    private int batchSize;

    /** 单次请求超时（做题输出比聊天长，默认给足 60 秒） */
    @Value("${app.ai.answer-timeout-ms:60000}")
    private int answerTimeoutMs;

    /**
     * 就地把网格里「答案为空」的行补上答案与解析。
     *
     * @param grid 第一行是表头，其余行与 {@code GrammaImportVO.Row} 同序
     * @return 实际补上的条数
     * @throws BizException AI 不可用，或一道题都没做出来
     */
    public int fill(List<List<String>> grid) {
        if (!llmClient.isAvailable()) {
            throw BizException.badRequest("这份 PDF 里没有答案，需要 AI 先做一遍才能入库，但"
                    + llmClient.unavailableReason() + "。"
                    + "可以在 application.yml 里配好 app.ai.api-key（或设置环境变量 AI_API_KEY）后重试，"
                    + "也可以把题目整理成 Excel/CSV、在「正确答案」列手工填好再导入");
        }

        List<Integer> pending = new ArrayList<>();
        for (int i = 1; i < grid.size(); i++) {
            List<String> row = grid.get(i);
            if (row.size() > GrammarPdfParser.COL_ANSWER && row.get(GrammarPdfParser.COL_ANSWER).isBlank()) {
                pending.add(i);
            }
        }
        if (pending.isEmpty()) {
            return 0;
        }

        log.info("AI 作答开始：共 {} 道题，每批 {} 道", pending.size(), batchSize);
        int filled = 0;
        for (int from = 0; from < pending.size(); from += batchSize) {
            List<Integer> chunk = pending.subList(from, Math.min(from + batchSize, pending.size()));
            try {
                filled += answerChunk(grid, chunk);
            } catch (Exception e) {
                log.warn("AI 作答第 {}-{} 题失败：{}", from + 1, from + chunk.size(), e.getMessage());
            }
        }
        log.info("AI 作答完成：{}/{} 道", filled, pending.size());

        if (filled == 0) {
            throw BizException.badRequest("AI 没能答出任何一道题（接口可能超时或返回格式不对），"
                    + "题目本身已经识别出来了，可以稍后重试，或改用 Excel/CSV 手工填答案");
        }
        return filled;
    }

    /** 一批若干题：拼 prompt -> 解析 JSON -> 回填 */
    private int answerChunk(List<List<String>> grid, List<Integer> indexes) {
        StringBuilder qs = new StringBuilder();
        int n = 0;
        for (int idx : indexes) {
            List<String> row = grid.get(idx);
            n++;
            qs.append(n).append(". ").append(row.get(GrammarPdfParser.COL_STEM)).append('\n');
            qs.append("A. ").append(row.get(GrammarPdfParser.COL_A)).append('\n');
            qs.append("B. ").append(row.get(GrammarPdfParser.COL_A + 1)).append('\n');
            qs.append("C. ").append(row.get(GrammarPdfParser.COL_A + 2)).append('\n');
            qs.append("D. ").append(row.get(GrammarPdfParser.COL_D)).append('\n');
        }

        String prompt = """
                你是专升本英语语法老师。下面是 %d 道单项选择题，请逐题作答。

                输出要求（必须严格遵守）：
                1. 只输出一个 JSON 数组，不要输出任何解释文字，不要用 ```json 代码块包裹。
                2. 数组每一项形如 {"i": 1, "answer": "B", "why": "一句话中文解析"}。
                3. i 是题号（1 开始），answer 只能是 A、B、C、D 之一，why 不超过 50 字。
                4. 必须给出全部 %d 道题的答案。

                题目：
                %s""".formatted(n, n, qs.toString().trim());

        JSONArray messages = new JSONArray();
        JSONObject sys = new JSONObject();
        sys.set("role", "system");
        sys.set("content", "你只输出严格的 JSON 数组，不写任何多余字符。");
        messages.add(sys);
        JSONObject user = new JSONObject();
        user.set("role", "user");
        user.set("content", prompt);
        messages.add(user);

        String raw = llmClient.chat(messages, answerTimeoutMs, 0.1);
        List<JSONObject> items = parseArray(raw);
        if (items.isEmpty()) {
            throw new IllegalStateException("模型没有返回可解析的 JSON 数组");
        }

        int filled = 0;
        for (JSONObject item : items) {
            Integer no = item.getInt("i");
            String ans = item.getStr("answer", "");
            if (no == null || no < 1 || no > indexes.size()) {
                continue;
            }
            String letter = normalize(ans);
            if (letter == null) {
                continue;
            }
            List<String> row = grid.get(indexes.get(no - 1));
            row.set(GrammarPdfParser.COL_ANSWER, letter);
            String why = item.getStr("why", "").trim();
            if (!why.isEmpty()) {
                row.set(GrammarPdfParser.COL_ANALYSIS, why + AI_TAG);
            }
            filled++;
        }
        return filled;
    }

    /** 模型偶尔会写 "B. because..." 或 "b"，统一取第一个 A~D 字母 */
    private static String normalize(String raw) {
        if (raw == null) {
            return null;
        }
        Matcher m = LETTER.matcher(raw.toUpperCase(Locale.ROOT));
        return m.find() ? m.group() : null;
    }

    /** 从模型输出里抠出 JSON 数组（容忍代码块、前后废话） */
    static List<JSONObject> parseArray(String text) {
        List<JSONObject> out = new ArrayList<>();
        if (text == null) {
            return out;
        }
        int start = text.indexOf('[');
        int end = text.lastIndexOf(']');
        if (start < 0 || end <= start) {
            return out;
        }
        try {
            JSONArray arr = JSONUtil.parseArray(text.substring(start, end + 1));
            for (Object o : arr) {
                if (o instanceof JSONObject jo) {
                    out.add(jo);
                }
            }
        } catch (Exception e) {
            log.warn("AI 返回的 JSON 解析失败：{}", e.getMessage());
        }
        return out;
    }
}
