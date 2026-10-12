package com.cc.englishquest.service;

import cn.hutool.json.JSONArray;
import cn.hutool.json.JSONObject;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.dto.AiChatDTO;
import com.cc.englishquest.entity.AiCallLog;
import com.cc.englishquest.entity.ErrorBook;
import com.cc.englishquest.entity.GrammarQuestion;
import com.cc.englishquest.entity.ListenSentence;
import com.cc.englishquest.entity.VocabQuestion;
import com.cc.englishquest.entity.WrongExplain;
import com.cc.englishquest.mapper.AiCallLogMapper;
import com.cc.englishquest.mapper.GrammarQuestionMapper;
import com.cc.englishquest.mapper.ListenSentenceMapper;
import com.cc.englishquest.mapper.VocabQuestionMapper;
import com.cc.englishquest.mapper.WrongExplainMapper;
import com.cc.englishquest.vo.AiChatVO;
import com.cc.englishquest.vo.AiExpandVO;
import com.cc.englishquest.vo.AiPassageVO;
import com.cc.englishquest.vo.AiStatusVO;
import com.cc.englishquest.vo.SimilarQuestionVO;
import com.cc.englishquest.vo.WrongExplainVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;

/**
 * AI 智能练习服务：按错题知识点生成同型题
 *
 * <p>Mock 模式下由本地题库生成同知识点题目，保证接口结构、限流、降级链路全部可用；
 * 配置 app.ai.mock=false 且填入 api-key 后自动切换为真实大模型调用。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiService {

    private final LlmClient llmClient;
    private final ErrorBookService errorBookService;
    private final AiCallLogMapper aiCallLogMapper;
    private final GrammarQuestionMapper grammarQuestionMapper;
    private final VocabQuestionMapper vocabQuestionMapper;
    private final ListenSentenceMapper listenSentenceMapper;
    private final WrongExplainMapper wrongExplainMapper;
    private final TaskService taskService;

    @Value("${app.ai.daily-limit:20}")
    private int dailyLimit;

    /**
     * 错题讲解的每日上限，与出题配额**分开**统计。
     * 起因：错题讲解是答错后自动触发的，频次远高于手动点「再来一题」，
     * 两者共用一个配额会让出题功能被讲解挤爆。
     */
    @Value("${app.ai.explain-daily-limit:60}")
    private int explainDailyLimit;

    /**
     * AI 对话的每日上限，同样与出题分开统计。
     * 对话轮次天然比出题多（一次问答一来一回），共用配额会把出题挤爆。
     */
    @Value("${app.ai.chat-daily-limit:0}")
    private int chatDailyLimit;

    /** 对话历史最多带多少轮给模型：太长会显著抬高 token 成本，也没什么必要 */
    private static final int CHAT_HISTORY_MAX = 12;

    /** 对话 System 提示：限定角色与回答风格，避免答无关话题 */
    private static final String CHAT_SYSTEM_PROMPT = """
            你是一位专升本英语辅导老师，正在和一名备考学生对话。
            要求：
            1. 用简体中文回答，涉及英语例句、单词、语法结构时保留英文原文；
            2. 回答简洁直接，控制在 300 字以内，不要客套和开场白；
            3. 只回答专升本英语学习范围内的问题（词汇、语法、听力、写作、应试方法）；
            4. 遇到无关问题，礼貌说明你只能帮英语学习相关的事。
            """;

    private static final String MODULE_GRAMMAR = "GRAMMAR";
    private static final String MODULE_VOCAB = "VOCAB";
    private static final String MODULE_LISTENING = "LISTENING";

    /** 讲解对象的题型，决定提示词与本地生成走哪一套话术 */
    private enum Kind { GRAMMAR, VOCAB, LISTENING }

    /**
     * 讲解对象的统一视图：把语法题、词汇题、听力句的差异一次性抹平，
     * 让提示词组装、本地生成、选项文本解析这些逻辑只写一份。
     *
     * <p>字段只是「取出来用」，不做任何加工 —— 加工发生在各自的 {@code of()} 里。</p>
     *
     * <p>听力句没有 optionA~D（听写没有选项），这几项留空；
     * {@code answer} 是参考英文原句，{@code chosen} 由调用方另行传入（学生敲的整句）。</p>
     */
    private record ExplainSubject(Kind kind, Long id, String stem,
                                  String optionA, String optionB, String optionC, String optionD,
                                  String answer, String analysis, String point) {

        static ExplainSubject of(GrammarQuestion q) {
            return new ExplainSubject(Kind.GRAMMAR, q.getId(), q.getStem(),
                    q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD(),
                    q.getAnswer(), q.getAnalysis(), q.getKnowledgePoint());
        }

        static ExplainSubject of(VocabQuestion q) {
            // 词汇题的「考点」就是它这个词本身；辨析题（同义/形近）时命中率高
            String point = q.getWord() == null ? "" : q.getWord().trim();
            // 题干用「word（释义）」而不是光一个词，模型才知道在考什么
            String stem = q.getWord() == null ? "" : q.getWord().trim();
            if (q.getMeaning() != null && !q.getMeaning().trim().isEmpty()) {
                stem = stem + "（" + q.getMeaning().trim() + "）";
            }
            return new ExplainSubject(Kind.VOCAB, q.getId(), stem,
                    q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD(),
                    q.getAnswer(), q.getAnalysis(), point);
        }

        static ExplainSubject of(ListenSentence q) {
            // 听力句：题干用中文译文（学生能看到的信息），答案是英文原句，
            // 解析里预置逐词差异，学生敲错的词一目了然
            String zh = q.getChinese() == null ? "" : q.getChinese().trim();
            return new ExplainSubject(Kind.LISTENING, q.getId(), zh,
                    "", "", "", "",
                    q.getEnglish(),
                    null, zh);
        }
    }

    /** 生成同型题 */
    @Transactional(rollbackFor = Exception.class)
    public SimilarQuestionVO generateSimilar(Long userId, Long errorId) {
        // 1. 每日调用次数限流（<=0 表示不限次数）
        long used = isUnlimited(dailyLimit) ? 0 : countToday(userId);
        if (!isUnlimited(dailyLimit) && used >= dailyLimit) {
            throw BizException.badRequest("今日 AI 出题次数已用完（每日上限 " + dailyLimit + " 次）");
        }

        // 2. 校验错题归属
        ErrorBook error = errorBookService.getById(errorId);
        if (error == null || !error.getUserId().equals(userId)) {
            throw BizException.badRequest("错题记录不存在");
        }

        long start = System.currentTimeMillis();
        SimilarQuestionVO vo;
        boolean success = true;
        try {
            if (llmClient.isMock()) {
                vo = mockGenerate(error);
                vo.setSource("MOCK");
            } else {
                String prompt = buildPrompt(error);
                String raw = llmClient.chat(prompt);
                vo = parseModelOutput(raw, error);
                vo.setSource("LLM");
            }
        } catch (Exception e) {
            // 3. 失败降级：回退到本地题库生成
            log.warn("AI 出题失败，降级到本地题库：{}", e.getMessage());
            vo = mockGenerate(error);
            vo.setSource("FALLBACK");
            success = false;
        }

        // 4. 记录调用日志（用于限流与统计）
        AiCallLog callLog = new AiCallLog();
        callLog.setUserId(userId);
        callLog.setErrorId(errorId);
        callLog.setKnowledgePoint(error.getKnowledgePoint());
        callLog.setSuccess(success ? 1 : 0);
        callLog.setCostMs((int) (System.currentTimeMillis() - start));
        callLog.setCreateTime(LocalDateTime.now());
        aiCallLogMapper.insert(callLog);

        // 5. 每日任务进度
        taskService.addProgress(userId, TaskService.TYPE_AI_COUNT, 1);

        // 不限次数时返回 -1，前端据此显示「不限次数」而不是「剩余 -1 次」
        vo.setRemainingQuota(isUnlimited(dailyLimit) ? -1 : (int) Math.max(0, dailyLimit - used - 1));
        return vo;
    }

    /** 今日剩余可用次数；返回 -1 表示不限次数 */
    public int remainingQuota(Long userId) {
        if (isUnlimited(dailyLimit)) {
            return -1;
        }
        return (int) Math.max(0, dailyLimit - countToday(userId));
    }

    /** 上限 <= 0 视为不限次数 */
    private boolean isUnlimited(int limit) {
        return limit <= 0;
    }

    /**
     * 今日出题次数。
     *
     * <p>★ 必须带 errorId 非空条件：出题一定关联某道错题，而 AI 对话不关联，
     * 用 {@code error_id} 区分两类调用。否则对话次数会被算进出题配额里，
     * 「今日剩余次数」会莫名其妙地掉。</p>
     */
    private long countToday(Long userId) {
        return aiCallLogMapper.selectCount(new LambdaQueryWrapper<AiCallLog>()
                .eq(AiCallLog::getUserId, userId)
                .isNotNull(AiCallLog::getErrorId)
                .ge(AiCallLog::getCreateTime, LocalDate.now().atStartOfDay()));
    }

    /** 今日对话次数（errorId 为空的那类记录） */
    private long countTodayChat(Long userId) {
        return aiCallLogMapper.selectCount(new LambdaQueryWrapper<AiCallLog>()
                .eq(AiCallLog::getUserId, userId)
                .isNull(AiCallLog::getErrorId)
                .ge(AiCallLog::getCreateTime, LocalDate.now().atStartOfDay()));
    }

    /* ======================= AI 对话 ======================= */

    /**
     * AI 对话是否可用，以及不可用的原因。
     *
     * <p>返回给前端的只有「可用性 + 原因 + 模型名 + 剩余次数」，
     * <b>不包含 api-key / base-url</b>。</p>
     */
    public AiStatusVO chatStatus(Long userId) {
        AiStatusVO vo = new AiStatusVO();
        boolean available = llmClient.isAvailable();
        vo.setChatAvailable(available);
        // 可用时 reason 为 null；前端的 tooltip 据此显示「可使用」或具体原因
        vo.setReason(llmClient.unavailableReason());
        vo.setModel(available ? llmClient.model() : null);
        vo.setRemaining(remainingChatQuota(userId));
        return vo;
    }

    /** 今日剩余对话次数；-1 表示不限次数 */
    public int remainingChatQuota(Long userId) {
        if (isUnlimited(chatDailyLimit)) {
            return -1;
        }
        return (int) Math.max(0, chatDailyLimit - countTodayChat(userId));
    }

    /**
     * 与 AI 对话。
     *
     * <p>★ 与同型题 / 短文不同，这里**不做本地降级**：没有 Key 或调用失败一律抛错。
     * 对话内容没法离线编得可信 —— 编一段话冒充模型的回答，学生分不出来，反而有害。</p>
     *
     * <p>★ 刻意**不加 @Transactional**：调用失败时要把失败这件事记进 t_ai_call_log，
     * 如果包在事务里，异常一抛出这条日志会被一起回滚，
     * 于是「一直失败」就永远不会累计次数，限流形同虚设。</p>
     */
    public AiChatVO chat(Long userId, AiChatDTO dto) {
        if (!llmClient.isAvailable()) {
            throw BizException.badRequest(llmClient.unavailableReason() + "，AI 对话不可用");
        }
        if (!isUnlimited(chatDailyLimit) && countTodayChat(userId) >= chatDailyLimit) {
            throw BizException.badRequest("今日 AI 对话次数已用完，明天再来");
        }

        JSONArray messages = new JSONArray();
        messages.add(llmClient.chatMessage("system", CHAT_SYSTEM_PROMPT));

        // 只取最近若干轮，且 history 由前端提供 —— 服务端不存会话
        List<AiChatDTO.Turn> history = dto.getHistory() == null ? List.of() : dto.getHistory();
        int from = Math.max(0, history.size() - CHAT_HISTORY_MAX);
        for (AiChatDTO.Turn turn : history.subList(from, history.size())) {
            String role = normalizeRole(turn.getRole());
            if (role == null) {
                continue;   // 非 user/assistant 的轮次直接丢掉，不接受前端塞 system
            }
            messages.add(llmClient.chatMessage(role, turn.getContent()));
        }
        messages.add(llmClient.chatMessage("user", dto.getMessage()));

        long used = isUnlimited(chatDailyLimit) ? 0 : countTodayChat(userId);
        long start = System.currentTimeMillis();
        boolean success = false;
        String reply;
        try {
            reply = llmClient.chat(messages);
            success = true;
        } catch (Exception e) {
            /*
             * 不把底层异常原文抛给前端：里面可能带接口地址等信息。
             * 学生只需要一句能懂的说明，细节留给服务端日志。
             * 注意必须抛 BizException —— 其他异常会被全局处理器兜成「系统繁忙」。
             */
            log.warn("AI 对话调用失败：{}", e.getMessage());
            throw new BizException("AI 服务暂时不可用，请稍后重试");
        } finally {
            // 失败的调用同样记账，避免「一直失败一直重试」把配额架空
            // （chat 方法刻意不加 @Transactional，否则异常会把这条日志一起回滚）
            AiCallLog callLog = new AiCallLog();
            callLog.setUserId(userId);
            callLog.setKnowledgePoint("AI_CHAT");   // errorId 留空 = 对话类调用（见 countToday 注释）
            callLog.setSuccess(success ? 1 : 0);
            callLog.setCostMs((int) (System.currentTimeMillis() - start));
            callLog.setCreateTime(LocalDateTime.now());
            aiCallLogMapper.insert(callLog);
        }
        if (reply == null || reply.isBlank()) {
            throw new BizException("AI 返回了空内容，请再试一次");
        }

        AiChatVO vo = new AiChatVO();
        vo.setReply(limitLength(reply, 2000));
        vo.setSource("LLM");
        vo.setRemainingQuota(isUnlimited(chatDailyLimit) ? -1
                : (int) Math.max(0, chatDailyLimit - used - 1));
        return vo;
    }

    /** 只放行 user / assistant；其余返回 null 由调用方丢弃 */
    private String normalizeRole(String role) {
        if ("user".equals(role) || "assistant".equals(role)) {
            return role;
        }
        return null;
    }

    /** 组装提示词 */
    private String buildPrompt(ErrorBook error) {
        return """
                你是一位专升本英语辅导老师。请围绕知识点【%s】生成一道%s，要求：
                1. 题干与题目中的原题不同，但考查同一个知识点；
                2. 提供四个选项（A/B/C/D），只有一个正确答案；
                3. 给出正确答案字母与简明中文解析（不超过 80 字）；
                4. 严格只输出 JSON，不要输出多余文字，格式如下：
                {"stem":"题干","options":["A选项","B选项","C选项","D选项"],"answer":"A","analysis":"解析"}
                """.formatted(
                error.getKnowledgePoint() == null ? "英语基础知识" : error.getKnowledgePoint(),
                "GRAMMAR".equals(error.getModule()) ? "语法单选题" : "词汇选择题");
    }

    /** 解析大模型返回内容 */
    private SimilarQuestionVO parseModelOutput(String raw, ErrorBook error) {
        JSONObject json = llmClient.extractJson(raw);
        if (json == null) {
            throw new IllegalStateException("大模型返回格式无法解析");
        }
        SimilarQuestionVO vo = new SimilarQuestionVO();
        vo.setStem(json.getStr("stem"));
        JSONArray options = json.getJSONArray("options");
        List<String> optionList = new ArrayList<>();
        if (options != null) {
            for (Object o : options) {
                optionList.add(String.valueOf(o));
            }
        }
        vo.setOptions(optionList);
        vo.setAnswer(json.getStr("answer"));
        vo.setAnalysis(json.getStr("analysis"));
        vo.setKnowledgePoint(error.getKnowledgePoint());
        return vo;
    }

    /**
     * 本地 Mock 生成：从题库中挑选同知识点的其他题目，保证内容真实可用
     */
    private SimilarQuestionVO mockGenerate(ErrorBook error) {
        SimilarQuestionVO vo = new SimilarQuestionVO();
        vo.setKnowledgePoint(error.getKnowledgePoint());

        if ("GRAMMAR".equals(error.getModule())) {
            LambdaQueryWrapper<GrammarQuestion> wrapper = new LambdaQueryWrapper<GrammarQuestion>()
                    .eq(GrammarQuestion::getStatus, 1)
                    .ne(GrammarQuestion::getId, error.getQuestionId());
            if (error.getKnowledgePoint() != null && !error.getKnowledgePoint().isBlank()) {
                wrapper.eq(GrammarQuestion::getKnowledgePoint, error.getKnowledgePoint());
            }
            wrapper.last("ORDER BY RAND() LIMIT 1");
            GrammarQuestion q = grammarQuestionMapper.selectOne(wrapper);
            if (q == null) {
                return templateFallback(error);
            }
            vo.setStem(q.getStem());
            vo.setOptions(Arrays.asList(q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD()));
            vo.setAnswer(q.getAnswer());
            vo.setAnalysis(q.getAnalysis());
            return vo;
        }

        // 词汇：同关卡再抽一题
        VocabQuestion origin = vocabQuestionMapper.selectById(error.getQuestionId());
        LambdaQueryWrapper<VocabQuestion> wrapper = new LambdaQueryWrapper<VocabQuestion>()
                .eq(VocabQuestion::getStatus, 1)
                .ne(VocabQuestion::getId, error.getQuestionId())
                .eq(origin != null && origin.getLevelId() != null, VocabQuestion::getLevelId,
                        origin == null ? null : origin.getLevelId())
                .eq(VocabQuestion::getType, "CHOICE")
                .last("ORDER BY RAND() LIMIT 1");
        VocabQuestion q = vocabQuestionMapper.selectOne(wrapper);
        if (q == null) {
            return templateFallback(error);
        }
        vo.setStem("选出与 " + q.getWord() + " 相符的中文释义");
        vo.setOptions(Arrays.asList(q.getOptionA(), q.getOptionB(), q.getOptionC(), q.getOptionD()));
        vo.setAnswer(q.getAnswer());
        vo.setAnalysis(q.getAnalysis());
        return vo;
    }

    /** 最后的兜底模板（题库无可用同型题时） */
    private SimilarQuestionVO templateFallback(ErrorBook error) {
        SimilarQuestionVO vo = new SimilarQuestionVO();
        vo.setStem("针对知识点【" + error.getKnowledgePoint() + "】的巩固练习：请复述该知识点的核心规则并完成原题。");
        vo.setOptions(Arrays.asList("A. 我已掌握该知识点", "B. 我需要再看一遍讲义",
                "C. 我需要向老师提问", "D. 我需要更多同类练习"));
        vo.setAnswer("A");
        vo.setAnalysis("建议结合讲义重新梳理【" + error.getKnowledgePoint() + "】的规则，"
                + "并完成原题：" + error.getStem() + "，正确答案：" + error.getCorrectAnswer());
        vo.setKnowledgePoint(error.getKnowledgePoint());
        return vo;
    }

    /* ======================= 错题针对性讲解 ======================= */

    /**
     * 针对「学生实际选中的那个错项」生成讲解。
     *
     * <p>与 {@link #generateSimilar} 的三处关键差异：</p>
     * <ol>
     *   <li><b>缓存优先</b>：讲解只取决于 (题目, 错项)，命中即返回，不调模型也不消耗配额；</li>
     *   <li><b>配额独立</b>：讲解由答错自动触发，频次远高于手动点「再来一题」，
     *       和出题共用一个配额会把出题功能挤爆；</li>
     *   <li><b>刻意不加 @Transactional</b>：缓存表可能尚未创建（没跑增量脚本），
     *       写失败必须能降级继续；而事务里发生 SQL 异常会把事务标记成 rollback-only，
     *       外层提交时会抛 UnexpectedRollbackException，反而把整个请求拖垮。</li>
     * </ol>
     *
     * <p>调用记录不写 t_ai_call_log —— 因为 {@link #countToday} 是按该表当天行数统计出题配额的，
     * 讲解若写进去会把出题配额一起吃掉。讲解的调用记录本来就是 t_wrong_explain 自己。</p>
     */
    public WrongExplainVO explainWrong(Long userId, Long questionId, String chosenRaw) {
        return explainWrong(userId, questionId, chosenRaw, MODULE_GRAMMAR);
    }

    /**
     * 同上，但显式指定模块（GRAMMAR / VOCAB / LISTENING）。
     *
     * <p>三个模块的题号各自在各自的表里自增，所以必须带上 module 才能定位；
     * 缺省走语法是为了让老前端（只传 questionId + chosen）继续可用。</p>
     */
    public WrongExplainVO explainWrong(Long userId, Long questionId, String chosenRaw, String moduleRaw) {
        String module = resolveModule(moduleRaw);
        String chosen = normalizeChosen(module, chosenRaw);
        if (chosen.isEmpty()) {
            throw BizException.badRequest("请提供你的错误作答");
        }

        ExplainSubject subject = loadSubject(module, questionId);
        // 选项题：选了正确答案就没什么可讲的；听力句：敲得一字不差同理。
        // 听力的"一致"要用听写判分那套归一化（去标点、压空白）来比 ——
        // 学生敲对句子却漏了句号，不该被当成错句去讲解。
        if (subject.kind() == Kind.LISTENING) {
            if (!nvl(subject.answer()).isEmpty()
                    && ListenService.normalize(subject.answer()).equals(ListenService.normalize(chosen))) {
                throw BizException.badRequest("你写的就是原句，无需针对性讲解");
            }
        } else {
            String answer = normalize(subject.answer());
            if (!answer.isEmpty() && answer.equals(chosen)) {
                throw BizException.badRequest("你选的正是正确答案，无需针对性讲解");
            }
        }

        // 1) 缓存优先
        WrongExplain cached = findExplain(module, questionId, chosen);
        if (cached != null) {
            return toVO(cached, subject, chosen, true, remainingExplainQuota());
        }

        // 2) 配额（<=0 表示不限次数）
        int remaining = remainingExplainQuota();
        if (!isUnlimited(explainDailyLimit) && remaining <= 0) {
            throw BizException.badRequest("今日 AI 讲解次数已用完（每日上限 "
                    + explainDailyLimit + " 次），可先看下方通用解析");
        }

        // 3) 生成：真实调用失败一律降级为本地生成，保证页面上永远有内容
        long start = System.currentTimeMillis();
        String content;
        String source;
        try {
            if (llmClient.isMock()) {
                content = localExplain(subject, chosen);
                source = "MOCK";
            } else {
                content = llmClient.chat(buildExplainPrompt(subject, chosen));
                source = "LLM";
            }
        } catch (Exception e) {
            log.warn("AI 错题讲解失败，降级为本地生成：{}", e.getMessage());
            content = localExplain(subject, chosen);
            source = "FALLBACK";
        }
        content = limitLength(content, 1000);
        log.info("生成错题讲解 module={} questionId={} chosen={} source={} 用户={} 耗时={}ms",
                module, questionId, chosen, source, userId, System.currentTimeMillis() - start);

        // 4) 落缓存（并发下唯一键可能冲突，冲突则复用已写入的那条）
        WrongExplain saved = saveExplain(module, questionId, chosen, content, source);

        return toVO(saved, subject, chosen, false,
                isUnlimited(explainDailyLimit) ? -1 : Math.max(0, remaining - 1));
    }

    /** 规范化 module：只认识 VOCAB / LISTENING，其余一律按 GRAMMAR（向后兼容） */
    private String resolveModule(String moduleRaw) {
        String m = nvl(moduleRaw);
        if (MODULE_VOCAB.equalsIgnoreCase(m)) {
            return MODULE_VOCAB;
        }
        if (MODULE_LISTENING.equalsIgnoreCase(m)) {
            return MODULE_LISTENING;
        }
        return MODULE_GRAMMAR;
    }

    /**
     * 规范化 chosen 并做形状校验。
     *
     * <p>选项题只接受 A/B/C/D（形状约束从 DTO 挪到了这里，为的是能给出更准确的提示，
     * 也给听力整句让路）；听力接受任意听写文本，只做长度保护。</p>
     */
    private String normalizeChosen(String module, String chosenRaw) {
        String raw = chosenRaw == null ? "" : chosenRaw.trim();
        if (MODULE_LISTENING.equals(module)) {
            return limitLength(raw, 300);
        }
        String up = raw.toUpperCase();
        if (!up.matches("[A-D]")) {
            throw BizException.badRequest("选项只能是 A/B/C/D");
        }
        return up;
    }

    /** 按模块把题目读成统一视图；题目不存在直接抛业务异常 */
    private ExplainSubject loadSubject(String module, Long questionId) {
        if (MODULE_VOCAB.equals(module)) {
            VocabQuestion q = vocabQuestionMapper.selectById(questionId);
            if (q == null) {
                throw BizException.badRequest("题目不存在");
            }
            return ExplainSubject.of(q);
        }
        if (MODULE_LISTENING.equals(module)) {
            ListenSentence q = listenSentenceMapper.selectById(questionId);
            if (q == null) {
                throw BizException.badRequest("题目不存在");
            }
            return ExplainSubject.of(q);
        }
        GrammarQuestion q = grammarQuestionMapper.selectById(questionId);
        if (q == null) {
            throw BizException.badRequest("题目不存在");
        }
        return ExplainSubject.of(q);
    }

    /** 今日剩余讲解次数；返回 -1 表示不限次数 */
    public int remainingExplainQuota() {
        if (isUnlimited(explainDailyLimit)) {
            return -1;
        }
        return (int) Math.max(0, explainDailyLimit - countTodayExplains());
    }

    /**
     * 今日已生成的讲解条数。
     *
     * <p>直接数缓存表当天新增的行，而不是另外维护一张计数表 ——
     * 因为命中缓存不会新增行，所以这个数字天然就等于"今天真实调用过模型的次数"。</p>
     */
    private long countTodayExplains() {
        try {
            return wrongExplainMapper.selectCount(new LambdaQueryWrapper<WrongExplain>()
                    .ge(WrongExplain::getCreateTime, LocalDate.now().atStartOfDay()));
        } catch (Exception e) {
            // 表未建（没执行 sql/06_wrong_explain.sql）时不该让功能整体不可用：退化为不限流
            log.warn("统计讲解配额失败，本次不做限流：{}", e.getMessage());
            return 0;
        }
    }

    private WrongExplain findExplain(String module, Long questionId, String chosen) {
        try {
            return wrongExplainMapper.selectOne(new LambdaQueryWrapper<WrongExplain>()
                    .eq(WrongExplain::getModule, module)
                    .eq(WrongExplain::getQuestionId, questionId)
                    .eq(WrongExplain::getChosen, chosen)
                    .last("LIMIT 1"));
        } catch (Exception e) {
            log.warn("读取讲解缓存失败（表可能未建）：{}", e.getMessage());
            return null;
        }
    }

    private WrongExplain saveExplain(String module, Long questionId, String chosen, String content, String source) {
        WrongExplain entity = new WrongExplain();
        entity.setModule(module);
        entity.setQuestionId(questionId);
        entity.setChosen(chosen);
        entity.setContent(content);
        entity.setSource(source);
        entity.setCreateTime(LocalDateTime.now());
        try {
            wrongExplainMapper.insert(entity);
            return entity;
        } catch (Exception e) {
            // 唯一键冲突（并发同时生成）或表未建：冲突就复用已写入的那条，其余情况退化为不缓存
            WrongExplain exist = findExplain(module, questionId, chosen);
            if (exist != null) {
                return exist;
            }
            log.warn("写入讲解缓存失败，本次不缓存：{}", e.getMessage());
            return entity;
        }
    }

    private WrongExplainVO toVO(WrongExplain entity, ExplainSubject q, String chosen,
                                boolean cached, Integer remaining) {
        String answer = normalize(q.answer());
        WrongExplainVO vo = new WrongExplainVO();
        vo.setQuestionId(q.id());
        vo.setChosen(chosen);
        if (q.kind() == Kind.LISTENING) {
            // 听力句没有选项字母：chosen / correctAnswer 直接回显整句文本
            vo.setChosenText(chosen);
            vo.setCorrectAnswer(nvl(q.answer()));
            vo.setCorrectAnswerText(nvl(q.answer()));
        } else {
            vo.setChosenText(optionText(q, chosen));
            vo.setCorrectAnswer(answer);
            vo.setCorrectAnswerText(optionText(q, answer));
        }
        vo.setContent(entity.getContent());
        vo.setSource(entity.getSource());
        vo.setCached(cached);
        vo.setRemainingQuota(remaining);
        return vo;
    }

    /**
     * 组装提示词。
     *
     * <p>选项题：必须把「学生选了什么」和两个选项的文本都显式喂进去，
     * 否则模型只会重复那套通用的"为什么正确答案对"，等于没做。</p>
     *
     * <p>听力句：没有选项，改为把「参考原句」「学生敲出的句子」「逐词差异」喂进去 ——
     * LCS 已经算清了漏了/多了哪些词，模型据此讲才有针对性。</p>
     */
    private String buildExplainPrompt(ExplainSubject q, String chosen) {
        if (q.kind() == Kind.LISTENING) {
            String diff = ListenService.diffWords(q.answer(), chosen);
            return """
                    你是一位专升本英语听力辅导老师。学生听写下面这句英文时写错了，请针对他实际写出的内容讲解。

                    中文意思：%s
                    正确的英文原句：%s
                    学生写的内容：%s
                    逐词差异：%s

                    要求：
                    1. 第一句直接指出学生错在哪：是漏了词、多写了词，还是把某个词听成了另一个词；
                    2. 把出错处的正确写法讲清楚（拼写、连读或弱读导致的听辨难点）；
                    3. 用中文口语化表达，60~120 字；不要复述整句、不要输出 JSON 或 Markdown、不要写"同学你好"之类的客套。
                    只输出讲解正文。
                    """.formatted(
                    nvl(q.stem()),
                    nvl(q.answer()),
                    nvl(chosen),
                    diff.isEmpty() ? "无明显差异" : diff);
        }

        String answer = normalize(q.answer());
        String point = hasText(q.point()) ? q.point().trim() : "英语基础知识";
        boolean vocab = q.kind() == Kind.VOCAB;
        // 词汇题的选项是中文释义，讲解重点在「词义对应」，不能照搬语法题那套词性搭配话术
        String taskLine = vocab
                ? "1. 第一句直接点出学生选的【%s. %s】是哪个词的意思、为什么不是本题单词的含义；"
                : "1. 第一句直接点出学生选的【%s. %s】错在哪里，说清是哪个语法点、词性或搭配出了问题；";
        String extraLine = vocab
                ? "3. 若这两个词义容易混，补一句记牢它们的小窍门（比如联想、词根）；"
                : "3. 若这两个选项容易混淆，补一句区分它们的窍门；";
        return ("""
                你是一位专升本英语辅导老师。下面%s学生选错了，请**针对他选的那一个选项**讲解，不要泛泛复述正确答案。

                题干：%s
                A. %s
                B. %s
                C. %s
                D. %s
                正确答案：%s. %s
                学生的选择：%s. %s
                考点：%s

                要求：
                """ + taskLine + """
                2. 再说明正确答案【%s. %s】为什么成立，给出可复用的判断依据；
                """ + extraLine + """
                4. 用中文口语化表达，60~120 字；不要复述题干、不要罗列其他选项、不要输出 JSON 或 Markdown、不要写"同学你好"之类的客套。
                只输出讲解正文。
                """).formatted(
                vocab ? "这道词汇题" : "这道单选题",
                nvl(q.stem()),
                nvl(q.optionA()), nvl(q.optionB()), nvl(q.optionC()), nvl(q.optionD()),
                answer, optionText(q, answer),
                chosen, optionText(q, chosen),
                point,
                chosen, optionText(q, chosen),
                answer, optionText(q, answer));
    }

    /**
     * 本地生成针对所选错项的讲解（Mock 模式与失败降级共用）。
     *
     * <p>必须真的提到学生选的那一项 —— 否则 Mock 模式下这个功能等于没做，
     * 本地演示时看不出与原来的通用解析有任何区别。</p>
     *
     * <p>听力句走单独一条：直接用 LCS 的逐词差异说清漏了/多了哪些词，
     * 这是听力模块最有价值的本地反馈（比"你写错了"具体得多）。</p>
     */
    private String localExplain(ExplainSubject q, String chosen) {
        if (q.kind() == Kind.LISTENING) {
            StringBuilder sb = new StringBuilder();
            sb.append("你写的是：").append(chosen).append("。");
            String diff = ListenService.diffWords(q.answer(), chosen);
            if (!diff.isEmpty()) {
                sb.append("对照原句，").append(diff).append("。");
            }
            sb.append("正确原句是：").append(nvl(q.answer())).append("。");
            if (hasText(q.stem())) {
                sb.append("这句话的意思是「").append(q.stem().trim()).append("」，可边听边回想它的读法。");
            }
            return sb.toString();
        }

        String answer = normalize(q.answer());
        String chosenText = optionText(q, chosen);
        String correctText = optionText(q, answer);

        StringBuilder sb = new StringBuilder();
        sb.append("你选的是 ").append(chosen).append(". ").append(chosenText)
                .append(q.kind() == Kind.VOCAB ? "，这一项不是本题单词的释义。" : "，这一项不符合题干的要求。");
        if (hasText(q.analysis())) {
            sb.append("本题的判定依据是：").append(q.analysis().trim());
        }
        String hint = distinguishHint(q, chosenText, correctText);
        if (!hint.isEmpty()) {
            sb.append(hint);
        }
        sb.append("正确答案是 ").append(answer).append(". ").append(correctText).append("。");
        if (hasText(q.point())) {
            sb.append(q.kind() == Kind.VOCAB
                    ? "建议把「" + q.point().trim() + "」的释义和它的近义词一起记。"
                    : "建议对照讲义把「" + q.point().trim() + "」的规则再过一遍。");
        }
        return sb.toString();
    }

    /**
     * 给所选错项与正确项补一句区分提示。
     *
     * <p>只是形态层面的小启发式（词尾差异 / 形近 / 完全不同），
     * 目的是让本地生成的讲解也带上"针对这两个选项"的信息量；
     * 真要讲清语法道理仍然依赖大模型。</p>
     *
     * <p>词汇题要单独走一条：它的选项是**中文释义**，不是词形，
     * 拿"词尾/形近"去套会得出「这两项字形只差词尾」这种明显错误的话。</p>
     */
    private String distinguishHint(ExplainSubject q, String chosenText, String correctText) {
        String a = chosenText == null ? "" : chosenText.trim().toLowerCase();
        String b = correctText == null ? "" : correctText.trim().toLowerCase();
        if (a.isEmpty() || b.isEmpty() || a.equals(b)) {
            return "";
        }
        if (q.kind() == Kind.VOCAB) {
            // 选项是词义：错项往往正是另一个词的正确释义，区分点在于「词 ↔ 义」的对应
            return "注意：这两项是不同单词的释义，别按字面意思猜，要按题干那个词本身的含义来选。";
        }
        if (a.startsWith(b) || b.startsWith(a)) {
            return "注意：这两项字形只差词尾，考的就是单复数或词形变化。";
        }
        if (commonPrefixLength(a, b) >= 2 && Math.abs(a.length() - b.length()) <= 2) {
            return "注意：这两项拼写很接近，命题人正是在考形近词区分。";
        }
        return "注意：要从词性和句子成分上把这两项分开看。";
    }

    private int commonPrefixLength(String a, String b) {
        int n = Math.min(a.length(), b.length());
        int i = 0;
        while (i < n && a.charAt(i) == b.charAt(i)) {
            i++;
        }
        return i;
    }

    /** 取选项文本；key 非法时返回空串而不是 null，避免前端把 null 渲染出来 */
    private String optionText(ExplainSubject q, String key) {
        if (key == null) {
            return "";
        }
        return switch (key.trim().toUpperCase()) {
            case "A" -> nvl(q.optionA());
            case "B" -> nvl(q.optionB());
            case "C" -> nvl(q.optionC());
            case "D" -> nvl(q.optionD());
            default -> "";
        };
    }

    private String normalize(String s) {
        return s == null ? "" : s.trim().toUpperCase();
    }

    private String nvl(String s) {
        return s == null ? "" : s.trim();
    }

    private boolean hasText(String s) {
        return s != null && !s.trim().isEmpty();
    }

    private String limitLength(String s, int max) {
        if (s == null) {
            return "";
        }
        String t = s.trim();
        return t.length() <= max ? t : t.substring(0, max);
    }

    /* ======================= 单词串烧：词汇错题多选 → 短文 ======================= */

    private static final int PASSAGE_MIN = 2;
    private static final int PASSAGE_MAX = 12;

    /**
     * 把勾选的若干词汇错题串成一篇英文短文。
     *
     * <p>为什么用错题 id 而不是直接传单词：错题本里的知识点/题干未必就是单词本身，
     * 传 id 才能回溯到 {@code t_vocab_question} 拿到权威的 word 与释义，
     * 也顺带完成「这条错题是不是你的、是不是词汇模块」的归属校验。</p>
     */
    public AiPassageVO generatePassage(Long userId, List<Long> errorIds) {
        if (errorIds == null || errorIds.size() < PASSAGE_MIN) {
            throw BizException.badRequest("请至少勾选两个单词");
        }
        // 去重且保持勾选顺序
        List<Long> ids = new ArrayList<>(new LinkedHashSet<>(errorIds));
        if (ids.size() > PASSAGE_MAX) {
            throw BizException.badRequest("一次最多选 " + PASSAGE_MAX + " 个单词");
        }

        List<String> words = new ArrayList<>();
        for (Long id : ids) {
            ErrorBook error = errorBookService.getById(id);
            if (error == null || !error.getUserId().equals(userId)) {
                throw BizException.badRequest("错题记录不存在");
            }
            if (!"VOCAB".equals(error.getModule())) {
                throw BizException.badRequest("只有词汇错题可以串成短文");
            }
            String word = vocabWordOf(error);
            if (hasText(word) && !words.contains(word)) {
                words.add(word);
            }
        }
        if (words.size() < PASSAGE_MIN) {
            throw BizException.badRequest("勾选的错题里有效单词不足两个");
        }

        AiPassageVO vo;
        try {
            if (llmClient.isMock()) {
                vo = localPassage(words);
                vo.setSource("MOCK");
            } else {
                JSONObject json = llmClient.extractJson(llmClient.chat(buildPassagePrompt(words)));
                if (json == null) {
                    throw new IllegalStateException("大模型返回格式无法解析");
                }
                vo = new AiPassageVO();
                vo.setTitle(nvl(json.getStr("title")));
                vo.setContent(nvl(json.getStr("content")));
                vo.setTranslation(json.getStr("translation"));
                vo.setSource("LLM");
            }
        } catch (Exception e) {
            log.warn("AI 生成单词短文失败，降级为本地范文：{}", e.getMessage());
            vo = localPassage(words);
            vo.setSource("FALLBACK");
        }
        vo.setWords(words);
        vo.setContent(limitLength(vo.getContent(), 2000));
        if (!hasText(vo.getTitle())) {
            vo.setTitle("A Study Story · " + words.size() + " words");
        }
        return vo;
    }

    /** 从错题回溯出单词；题目被删时退化为知识点，再退化为空 */
    private String vocabWordOf(ErrorBook error) {
        if (error.getQuestionId() != null) {
            VocabQuestion q = vocabQuestionMapper.selectById(error.getQuestionId());
            if (q != null && hasText(q.getWord())) {
                return q.getWord().trim();
            }
        }
        return hasText(error.getKnowledgePoint()) ? error.getKnowledgePoint().trim() : "";
    }

    private String buildPassagePrompt(List<String> words) {
        return """
                你是一位专升本英语辅导老师。请用下面这些单词写一篇英文短文，帮学生把它们一次记住。
                单词：%s

                要求：
                1. 每个单词都至少出现一次，用法符合它的词性；
                2. 短文要有完整情节、语言自然，不要罗列单词，更不要写成单词表；
                3. 长度 120~180 词，难度贴近专升本英语阅读；
                4. 严格只输出 JSON，不要输出多余文字，格式如下：
                {"title":"英文标题","content":"英文短文","translation":"中文参考译文"}
                """.formatted(String.join(", ", words));
    }

    /**
     * 本地范文：没有 Key 时也能给出成篇内容。
     *
     * <p>刻意把每个单词放在「引号 + 通用框架句」里 —— 词的词性未知，
     * 只有不依赖词性的框架句才能保证本地稿语法不出错；
     * 真要把词自然融入情节，仍然依赖大模型。</p>
     */
    private AiPassageVO localPassage(List<String> words) {
        String[] frames = {
                "I met \"%s\" first, and I could not remember what it meant.",
                "Then \"%s\" showed up again, so I read the whole sentence twice.",
                "Later \"%s\" was written on the next line of my notebook.",
                "\"%s\" looked strange at first, but the meaning slowly became clear.",
                "I came across \"%s\" once more before lunch and finally worked it out.",
                "By the afternoon, \"%s\" no longer slowed me down."
        };
        StringBuilder sb = new StringBuilder();
        sb.append("That morning I opened my notebook and put down ").append(words.size())
                .append(" words I had got wrong: ").append(String.join(", ", words)).append(".\n\n");
        for (int i = 0; i < words.size(); i++) {
            sb.append(String.format(frames[i % frames.length], words.get(i))).append(' ');
        }
        sb.append("\n\nBy the evening all of them felt familiar. I closed the notebook and read the list once more: ")
                .append(String.join(", ", words)).append('.');

        AiPassageVO vo = new AiPassageVO();
        vo.setTitle("A Study Story · " + words.size() + " words");
        vo.setWords(words);
        vo.setContent(sb.toString());
        return vo;
    }

    /* ======================= 语法错题 → 知识点拓展 ======================= */

    /**
     * 围绕语法错题的考点做一次拓展讲解。
     *
     * <p>与 {@link #explainWrong} 的分工：讲解回答「我这次的错选错在哪」，
     * 拓展回答「这个考点还有哪些坑」——后者不针对某一次作答，所以结果可以复用。</p>
     */
    public AiExpandVO expandKnowledge(Long userId, Long errorId) {
        ErrorBook error = errorBookService.getById(errorId);
        if (error == null || !error.getUserId().equals(userId)) {
            throw BizException.badRequest("错题记录不存在");
        }
        if (!MODULE_GRAMMAR.equals(error.getModule())) {
            throw BizException.badRequest("只有语法错题可以拓展知识点");
        }

        GrammarQuestion q = error.getQuestionId() == null ? null
                : grammarQuestionMapper.selectById(error.getQuestionId());
        String point = q != null && hasText(q.getKnowledgePoint()) ? q.getKnowledgePoint().trim()
                : (hasText(error.getKnowledgePoint()) ? error.getKnowledgePoint().trim() : "英语语法基础");

        AiExpandVO vo = new AiExpandVO();
        vo.setQuestionId(error.getQuestionId());
        vo.setKnowledgePoint(point);
        vo.setStem(q != null ? nvl(q.getStem()) : nvl(error.getStem()));
        vo.setCorrectAnswer(q != null ? normalize(q.getAnswer()) : nvl(error.getCorrectAnswer()));
        vo.setAnalysis(q != null ? nvl(q.getAnalysis()) : nvl(error.getAnalysis()));

        try {
            if (llmClient.isMock()) {
                vo.setContent(localExpand(q, error, point));
                vo.setSource("MOCK");
            } else {
                vo.setContent(nvl(llmClient.chat(buildExpandPrompt(q, error, point))));
                vo.setSource("LLM");
            }
        } catch (Exception e) {
            log.warn("AI 拓展语法知识点失败，降级为本地生成：{}", e.getMessage());
            vo.setContent(localExpand(q, error, point));
            vo.setSource("FALLBACK");
        }
        vo.setContent(limitLength(vo.getContent(), 1500));
        return vo;
    }

    private String buildExpandPrompt(GrammarQuestion q, ErrorBook error, String point) {
        String correct = q != null ? normalize(q.getAnswer()) : nvl(error.getCorrectAnswer());
        String correctText = q != null ? optionText(ExplainSubject.of(q), correct) : "";
        return """
                你是一位专升本英语辅导老师。学生在下面这道语法题上出错了，请围绕考点【%s】做一次知识点拓展。

                题干：%s
                A. %s
                B. %s
                C. %s
                D. %s
                正确答案：%s. %s
                学生的错选：%s
                原解析：%s

                要求：
                1. 先用一句话点明这个考点在考试里到底考什么；
                2. 讲清规则（给判别步骤或口诀），再结合本题说明为什么选 %s；
                3. 指出最常见的两个易错点；
                4. 中文口语化表达，180~280 字，分 3~4 个小段，不要输出 JSON 或 Markdown 标题符号。
                只输出正文。
                """.formatted(
                point,
                q != null ? nvl(q.getStem()) : nvl(error.getStem()),
                q != null ? nvl(q.getOptionA()) : "",
                q != null ? nvl(q.getOptionB()) : "",
                q != null ? nvl(q.getOptionC()) : "",
                q != null ? nvl(q.getOptionD()) : "",
                correct, correctText,
                nvl(error.getWrongAnswer()),
                q != null && hasText(q.getAnalysis()) ? q.getAnalysis().trim() : nvl(error.getAnalysis()),
                correct);
    }

    /** 本地拓展：没有 Key 时把考点、原题、判定依据整理成可复习的条目 */
    private String localExpand(GrammarQuestion q, ErrorBook error, String point) {
        String analysis = q != null && hasText(q.getAnalysis()) ? q.getAnalysis().trim()
                : nvl(error.getAnalysis());
        String correct = q != null ? normalize(q.getAnswer()) : nvl(error.getCorrectAnswer());
        String correctText = q != null ? optionText(ExplainSubject.of(q), correct) : "";
        String wrong = nvl(error.getWrongAnswer());

        StringBuilder sb = new StringBuilder();
        sb.append("【考点定位】").append(point).append('\n');
        String stem = q != null ? nvl(q.getStem()) : nvl(error.getStem());
        if (!stem.isEmpty()) {
            sb.append("【原题回顾】").append(stem).append('\n');
        }
        if (!analysis.isEmpty()) {
            sb.append("【判定依据】").append(analysis).append('\n');
        }
        if (!correct.isEmpty()) {
            sb.append("【正确答案】").append(correct);
            if (!correctText.isEmpty()) {
                sb.append(". ").append(correctText);
            }
            sb.append('\n');
        }
        if (!wrong.isEmpty() && !wrong.equals(correct)) {
            sb.append("【你的错选】").append(wrong)
                    .append(" —— 代入题干后与「").append(point).append("」的规则相冲突。\n");
        }
        sb.append("【举一反三】遇到考「").append(point)
                .append("」的题，先圈出题干里的时间标志词和主语，再判断该用哪种形式；")
                .append("四个选项里只有一项同时满足形式与意义，其余多在时态、语态或词形上做手脚。\n");
        sb.append("【复习建议】回到讲义把「").append(point)
                .append("」的规则表抄一遍，再把本题四个选项逐一代入读一遍，体会差别。");
        return sb.toString();
    }
}
