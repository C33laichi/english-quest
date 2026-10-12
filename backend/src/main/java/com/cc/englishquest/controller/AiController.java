package com.cc.englishquest.controller;

import com.cc.englishquest.common.Result;
import com.cc.englishquest.dto.AiChatDTO;
import com.cc.englishquest.dto.AiExpandDTO;
import com.cc.englishquest.dto.AiPassageDTO;
import com.cc.englishquest.dto.AiSimilarDTO;
import com.cc.englishquest.dto.WrongExplainDTO;
import com.cc.englishquest.service.AiService;
import com.cc.englishquest.util.UserContext;
import com.cc.englishquest.vo.AiChatVO;
import com.cc.englishquest.vo.AiExpandVO;
import com.cc.englishquest.vo.AiPassageVO;
import com.cc.englishquest.vo.AiStatusVO;
import com.cc.englishquest.vo.SimilarQuestionVO;
import com.cc.englishquest.vo.WrongExplainVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * AI 智能练习
 */
@RestController
@RequestMapping("/api/ai")
@RequiredArgsConstructor
public class AiController {

    private final AiService aiService;

    /** 按错题生成同型题 */
    @PostMapping("/similar-question")
    public Result<SimilarQuestionVO> similar(@Valid @RequestBody AiSimilarDTO dto) {
        return Result.success(aiService.generateSimilar(UserContext.userId(), dto.getErrorId()));
    }

    /**
     * 针对学生实际选中的错项生成讲解
     *
     * <p>只服务语法关（先跑通再推广到词汇关）。请求体带 chosen，是因为
     * 同一道题选 B 和选 C 是两种不同的错法，讲解必须跟着学生的那一次选择走。</p>
     */
    @PostMapping("/wrong-explain")
    public Result<WrongExplainVO> wrongExplain(@Valid @RequestBody WrongExplainDTO dto) {
        return Result.success(aiService.explainWrong(
                UserContext.userId(), dto.getQuestionId(), dto.getChosen(), dto.getModule()));
    }

    /** 今日剩余次数（出题 / 讲解分开统计；-1 表示不限次数） */
    @GetMapping("/quota")
    public Result<Map<String, Object>> quota() {
        Map<String, Object> data = new HashMap<>();
        data.put("remaining", aiService.remainingQuota(UserContext.userId()));
        data.put("explainRemaining", aiService.remainingExplainQuota());
        return Result.success(data);
    }

    /** 单词串烧：勾选多个词汇错题 → 生成一篇把它们串起来的短文 */
    @PostMapping("/passage")
    public Result<AiPassageVO> passage(@Valid @RequestBody AiPassageDTO dto) {
        return Result.success(aiService.generatePassage(UserContext.userId(), dto.getErrorIds()));
    }

    /** 语法错题 → 考点拓展讲解 */
    @PostMapping("/expand")
    public Result<AiExpandVO> expand(@Valid @RequestBody AiExpandDTO dto) {
        return Result.success(aiService.expandKnowledge(UserContext.userId(), dto.getErrorId()));
    }

    /**
     * AI 能力可用性状态。
     *
     * <p>前端靠它决定「AI 对话」入口显示可使用还是不可使用，
     * 并在不可用时拿到具体原因做提示。<b>不含任何密钥信息。</b></p>
     */
    @GetMapping("/status")
    public Result<AiStatusVO> status() {
        return Result.success(aiService.chatStatus(UserContext.userId()));
    }

    /**
     * AI 对话（多轮）。
     *
     * <p>服务端不维护会话：历史由前端随请求带上，只取最近若干轮。
     * 没配 Key 时直接拒绝，不做本地降级 —— 编出来的「AI 回答」会误导学生。</p>
     */
    @PostMapping("/chat")
    public Result<AiChatVO> chat(@Valid @RequestBody AiChatDTO dto) {
        return Result.success(aiService.chat(UserContext.userId(), dto));
    }
}
