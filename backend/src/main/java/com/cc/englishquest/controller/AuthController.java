package com.cc.englishquest.controller;

import com.cc.englishquest.common.Result;
import com.cc.englishquest.dto.LoginDTO;
import com.cc.englishquest.dto.PasswordDTO;
import com.cc.englishquest.dto.RegisterDTO;
import com.cc.englishquest.service.AuthService;
import com.cc.englishquest.vo.LoginVO;
import com.cc.englishquest.vo.UserVO;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 认证与个人信息
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public Result<UserVO> register(@Valid @RequestBody RegisterDTO dto) {
        return Result.success("注册成功", authService.register(dto));
    }

    @PostMapping("/login")
    public Result<LoginVO> login(@Valid @RequestBody LoginDTO dto) {
        return Result.success("登录成功", authService.login(dto));
    }

    @PostMapping("/logout")
    public Result<Void> logout() {
        // 无状态 JWT：前端清除本地 Token 即可，服务端不维护会话
        return Result.success();
    }

    @GetMapping("/me")
    public Result<UserVO> me() {
        return Result.success(authService.currentUser());
    }

    @PutMapping("/me")
    public Result<UserVO> updateProfile(@RequestBody Map<String, String> body) {
        return Result.success(authService.updateProfile(body.get("nickname"), body.get("avatar")));
    }

    @PutMapping("/password")
    public Result<Void> updatePassword(@Valid @RequestBody PasswordDTO dto) {
        authService.updatePassword(dto);
        return Result.success();
    }
}
