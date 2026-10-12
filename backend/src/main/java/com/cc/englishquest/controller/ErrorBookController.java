package com.cc.englishquest.controller;

import com.cc.englishquest.common.Result;
import com.cc.englishquest.entity.ErrorBook;
import com.cc.englishquest.service.ErrorBookService;
import com.cc.englishquest.util.UserContext;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 错题本
 */
@RestController
@RequestMapping("/api/error-book")
@RequiredArgsConstructor
public class ErrorBookController {

    private final ErrorBookService errorBookService;

    /** 错题列表 */
    @GetMapping("/list")
    public Result<List<ErrorBook>> list(@RequestParam(required = false) String module,
                                        @RequestParam(required = false) Integer status,
                                        @RequestParam(required = false) String keyword) {
        return Result.success(errorBookService.list(UserContext.userId(), module, status, keyword));
    }

    /** 未掌握数量 */
    @GetMapping("/count")
    public Result<Map<String, Object>> count() {
        return Result.success(Map.of("unmastered", errorBookService.countUnmastered(UserContext.userId())));
    }

    /** 错题重练 */
    @PostMapping("/{id}/retry")
    public Result<Map<String, Object>> retry(@PathVariable Long id, @RequestBody Map<String, String> body) {
        boolean correct = errorBookService.retry(id, body.get("userAnswer"));
        return Result.success(Map.of("correct", correct));
    }

    /** 标记已掌握 */
    @PutMapping("/{id}/master")
    public Result<Void> master(@PathVariable Long id) {
        errorBookService.master(id);
        return Result.success();
    }

    /** 移除错题 */
    @DeleteMapping("/{id}")
    public Result<Void> remove(@PathVariable Long id) {
        errorBookService.remove(id);
        return Result.success();
    }
}
