package com.cc.englishquest.controller;

import com.cc.englishquest.common.Result;
import com.cc.englishquest.dto.SubmitDTO;
import com.cc.englishquest.service.GrammarService;
import com.cc.englishquest.util.UserContext;
import com.cc.englishquest.vo.GrammarLessonVO;
import com.cc.englishquest.vo.SubmitResultVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 语法闯关（28 天语法体系）
 */
@RestController
@RequestMapping("/api/grammar")
@RequiredArgsConstructor
public class GrammarController {

    private final GrammarService grammarService;

    /** 28 天路线图 */
    @GetMapping("/lessons")
    public Result<List<GrammarLessonVO>> lessons() {
        return Result.success(grammarService.listLessons(UserContext.userId()));
    }

    /** 讲义 + 测验题目 */
    @GetMapping("/lessons/{day}")
    public Result<Map<String, Object>> lesson(@PathVariable Integer day) {
        return Result.success(grammarService.getLesson(UserContext.userId(), day));
    }

    /** 提交测验 */
    @PostMapping("/lessons/{day}/submit")
    public Result<SubmitResultVO> submit(@PathVariable Integer day, @Valid @RequestBody SubmitDTO dto) {
        return Result.success(grammarService.submit(UserContext.userId(), day, dto));
    }
}
