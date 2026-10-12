package com.cc.englishquest.controller;

import com.cc.englishquest.common.Result;
import com.cc.englishquest.dto.SubmitDTO;
import com.cc.englishquest.service.VocabService;
import com.cc.englishquest.util.UserContext;
import com.cc.englishquest.vo.LevelVO;
import com.cc.englishquest.vo.QuestionVO;
import com.cc.englishquest.vo.SubmitResultVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 词汇闯关
 */
@RestController
@RequestMapping("/api/vocab")
@RequiredArgsConstructor
public class VocabController {

    private final VocabService vocabService;

    /** 关卡地图 */
    @GetMapping("/levels")
    public Result<List<LevelVO>> levels() {
        return Result.success(vocabService.listLevels(UserContext.userId()));
    }

    /** 抽取本关题目 */
    @GetMapping("/levels/{id}/questions")
    public Result<List<QuestionVO>> questions(@PathVariable Long id) {
        return Result.success(vocabService.getQuestions(UserContext.userId(), id));
    }

    /** 提交闯关 */
    @PostMapping("/levels/{id}/submit")
    public Result<SubmitResultVO> submit(@PathVariable Long id, @Valid @RequestBody SubmitDTO dto) {
        return Result.success(vocabService.submit(UserContext.userId(), id, dto));
    }
}
