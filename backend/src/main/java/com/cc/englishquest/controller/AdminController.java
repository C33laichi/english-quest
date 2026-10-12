package com.cc.englishquest.controller;

import com.cc.englishquest.common.PageResult;
import com.cc.englishquest.common.Result;
import com.cc.englishquest.dto.AdminUserDTO;
import com.cc.englishquest.entity.GrammarLesson;
import com.cc.englishquest.entity.GrammarQuestion;
import com.cc.englishquest.entity.VocabLevel;
import com.cc.englishquest.entity.VocabQuestion;
import com.cc.englishquest.service.AdminService;
import com.cc.englishquest.service.GrammarImportService;
import com.cc.englishquest.service.VocabImportService;
import com.cc.englishquest.vo.AdminStatsVO;
import com.cc.englishquest.vo.GrammarImportVO;
import com.cc.englishquest.vo.UserVO;
import com.cc.englishquest.vo.VocabImportVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/**
 * 后台管理（仅 ADMIN 角色可访问，鉴权由拦截器统一处理）
 */
@RestController
@RequestMapping("/api/admin")
@RequiredArgsConstructor
public class AdminController {

    private final AdminService adminService;
    private final VocabImportService vocabImportService;
    private final GrammarImportService grammarImportService;

    // ---------------- 用户 ----------------

    @GetMapping("/users")
    public Result<PageResult<UserVO>> users(@RequestParam(defaultValue = "1") Integer pageNum,
                                            @RequestParam(defaultValue = "10") Integer pageSize,
                                            @RequestParam(required = false) String keyword,
                                            @RequestParam(required = false) String role) {
        return Result.success(adminService.users(pageNum, pageSize, keyword, role));
    }

    @PutMapping("/users/{id}/status")
    public Result<Void> updateStatus(@PathVariable Long id, @RequestParam Integer status) {
        adminService.updateUserStatus(id, status);
        return Result.success();
    }

    @PutMapping("/users/{id}/reset-password")
    public Result<Void> resetPassword(@PathVariable Long id) {
        adminService.resetPassword(id);
        return Result.success();
    }

    @DeleteMapping("/users/{id}")
    public Result<Void> deleteUser(@PathVariable Long id) {
        adminService.deleteUser(id);
        return Result.success();
    }

    /** 新增用户（可指定角色）—— 管理员账号的注册入口 */
    @PostMapping("/users")
    public Result<UserVO> createUser(@Valid @RequestBody AdminUserDTO dto) {
        return Result.success("新增成功", adminService.createUser(dto));
    }

    // ---------------- 词汇题库 ----------------

    @GetMapping("/vocab/questions")
    public Result<PageResult<VocabQuestion>> vocabQuestions(@RequestParam(defaultValue = "1") Integer pageNum,
                                                            @RequestParam(defaultValue = "10") Integer pageSize,
                                                            @RequestParam(required = false) Long levelId,
                                                            @RequestParam(required = false) String keyword) {
        return Result.success(adminService.vocabQuestions(pageNum, pageSize, levelId, keyword));
    }

    @PostMapping("/vocab/questions")
    public Result<Void> saveVocabQuestion(@RequestBody VocabQuestion question) {
        adminService.saveVocabQuestion(question);
        return Result.success();
    }

    @DeleteMapping("/vocab/questions/{id}")
    public Result<Void> deleteVocabQuestion(@PathVariable Long id) {
        adminService.deleteVocabQuestion(id);
        return Result.success();
    }

    /**
     * 词汇题库批量导入（上传 .xlsx / .xls / .csv）。
     *
     * <p>{@code dryRun=true} 时只解析、把结果与错误行回报给管理员核对，不写库；
     * 前端先走一次预览、确认后再传一次 {@code dryRun=false} 真正导入。
     * 因为预览与导入都要用到同一个文件，所以让前端把同一份 FormData 发两次，
     * 服务端不保存任何临时文件。</p>
     */
    @PostMapping("/vocab/import")
    public Result<VocabImportVO> importVocabQuestions(@RequestParam("file") MultipartFile file,
                                                     @RequestParam Long levelId,
                                                     @RequestParam(defaultValue = "false") boolean dryRun,
                                                     @RequestParam(required = false) String defaultType) {
        return Result.success(dryRun
                ? vocabImportService.preview(file, levelId, defaultType)
                : vocabImportService.doImport(file, levelId, defaultType));
    }

    @GetMapping("/vocab/levels")
    public Result<List<VocabLevel>> vocabLevels() {
        return Result.success(adminService.vocabLevels());
    }

    @PostMapping("/vocab/levels")
    public Result<Void> saveVocabLevel(@RequestBody VocabLevel level) {
        adminService.saveVocabLevel(level);
        return Result.success();
    }

    @DeleteMapping("/vocab/levels/{id}")
    public Result<Void> deleteVocabLevel(@PathVariable Long id) {
        adminService.deleteVocabLevel(id);
        return Result.success();
    }

    // ---------------- 语法题库 ----------------

    @GetMapping("/grammar/lessons")
    public Result<List<GrammarLesson>> grammarLessons() {
        return Result.success(adminService.grammarLessons());
    }

    @PostMapping("/grammar/lessons")
    public Result<Void> saveGrammarLesson(@RequestBody GrammarLesson lesson) {
        adminService.saveGrammarLesson(lesson);
        return Result.success();
    }

    @DeleteMapping("/grammar/lessons/{id}")
    public Result<Void> deleteGrammarLesson(@PathVariable Long id) {
        adminService.deleteGrammarLesson(id);
        return Result.success();
    }

    @GetMapping("/grammar/questions")
    public Result<PageResult<GrammarQuestion>> grammarQuestions(@RequestParam(defaultValue = "1") Integer pageNum,
                                                                @RequestParam(defaultValue = "10") Integer pageSize,
                                                                @RequestParam(required = false) Long lessonId,
                                                                @RequestParam(required = false) String keyword) {
        return Result.success(adminService.grammarQuestions(pageNum, pageSize, lessonId, keyword));
    }

    @PostMapping("/grammar/questions")
    public Result<Void> saveGrammarQuestion(@RequestBody GrammarQuestion question) {
        adminService.saveGrammarQuestion(question);
        return Result.success();
    }

    @DeleteMapping("/grammar/questions/{id}")
    public Result<Void> deleteGrammarQuestion(@PathVariable Long id) {
        adminService.deleteGrammarQuestion(id);
        return Result.success();
    }

    /**
     * 语法题库批量导入。
     *
     * <p>{@code lessonId} 是<b>默认</b>目标 Day：「天数」列留空的行落到它，
     * 填了值的行按自己的走 —— 因此一份文件可以同时导入多天的题。</p>
     *
     * <p>{@code dryRun=true} 只解析不写库，用于"先预览再确认"。</p>
     */
    @PostMapping("/grammar/import")
    public Result<GrammarImportVO> importGrammarQuestions(@RequestParam("file") MultipartFile file,
                                                          @RequestParam Long lessonId,
                                                          @RequestParam(defaultValue = "false") boolean dryRun) {
        return Result.success(dryRun
                ? grammarImportService.preview(file, lessonId)
                : grammarImportService.doImport(file, lessonId));
    }

    // ---------------- 统计 ----------------

    @GetMapping("/stats")
    public Result<AdminStatsVO> stats() {
        return Result.success(adminService.stats());
    }
}
