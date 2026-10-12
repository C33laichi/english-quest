package com.cc.englishquest.util;

import cn.hutool.jwt.JWT;
import com.cc.englishquest.common.BizException;
import lombok.Data;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Date;

/**
 * JWT 工具（基于 Hutool 实现，无状态鉴权）
 */
@Component
public class JwtUtil {

    @Value("${app.jwt.secret}")
    private String secret;

    @Value("${app.jwt.expire-days:7}")
    private Integer expireDays;

    /** 签发 Token */
    public String createToken(Long userId, String username, String role) {
        Date now = new Date();
        Date expire = new Date(now.getTime() + expireDays * 24L * 3600 * 1000);
        return JWT.create()
                .setPayload("userId", userId)
                .setPayload("username", username)
                .setPayload("role", role)
                .setIssuedAt(now)
                .setExpiresAt(expire)
                .setKey(secret.getBytes(StandardCharsets.UTF_8))
                .sign();
    }

    /** 解析 Token，失败抛出 401 */
    public LoginUser parse(String token) {
        if (token == null || token.isBlank()) {
            throw BizException.unauthorized("未登录或登录已过期");
        }
        String raw = token.startsWith("Bearer ") ? token.substring(7) : token;
        try {
            boolean ok = JWT.of(raw).setKey(secret.getBytes(StandardCharsets.UTF_8)).verify();
            if (!ok) {
                throw BizException.unauthorized("登录状态无效，请重新登录");
            }
            JWT jwt = JWT.of(raw).setKey(secret.getBytes(StandardCharsets.UTF_8));
            LoginUser user = new LoginUser();
            user.setUserId(Long.valueOf(String.valueOf(jwt.getPayload("userId"))));
            user.setUsername(String.valueOf(jwt.getPayload("username")));
            user.setRole(String.valueOf(jwt.getPayload("role")));
            return user;
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            throw BizException.unauthorized("登录状态无效，请重新登录");
        }
    }

    @Data
    public static class LoginUser {
        private Long userId;
        private String username;
        private String role;
    }
}
