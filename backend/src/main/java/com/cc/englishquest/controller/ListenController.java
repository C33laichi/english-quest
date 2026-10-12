package com.cc.englishquest.controller;

import com.cc.englishquest.common.Result;
import com.cc.englishquest.dto.ListenCheckDTO;
import com.cc.englishquest.dto.ListenSubmitDTO;
import com.cc.englishquest.service.ListenService;
import com.cc.englishquest.util.UserContext;
import com.cc.englishquest.vo.ListenCheckVO;
import com.cc.englishquest.vo.ListenLevelVO;
import com.cc.englishquest.vo.ListenResultVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * 听力听写
 */
@RestController
@RequestMapping("/api/listen")
@RequiredArgsConstructor
public class ListenController {

    private final ListenService listenService;

    /** 听力关卡列表 */
    @GetMapping("/levels")
    public Result<List<ListenLevelVO>> levels() {
        return Result.success(listenService.listLevels(UserContext.userId()));
    }

    /**
     * 开始练习：抽句并下发提示
     *
     * @param mode EASY 简单（给每词长度）/ HARD 困难（不给任何长度信息）
     */
    @GetMapping("/levels/{id}/sentences")
    public Result<Map<String, Object>> sentences(@PathVariable Long id,
                                                 @RequestParam(defaultValue = "EASY") String mode,
                                                 @RequestParam(required = false) Integer count) {
        return Result.success(listenService.start(UserContext.userId(), id, mode, count));
    }

    /** 单句即时判分（不落库，仅返回比对结果） */
    @PostMapping("/check")
    public Result<ListenCheckVO> check(@Valid @RequestBody ListenCheckDTO dto) {
        return Result.success(listenService.check(UserContext.userId(), dto));
    }

    /** 提交整关练习 */
    @PostMapping("/levels/{id}/submit")
    public Result<ListenResultVO> submit(@PathVariable Long id, @Valid @RequestBody ListenSubmitDTO dto) {
        return Result.success(listenService.submit(UserContext.userId(), id, dto));
    }
}
