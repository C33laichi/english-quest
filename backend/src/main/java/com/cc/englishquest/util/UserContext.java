package com.cc.englishquest.util;

import com.cc.englishquest.common.BizException;

/**
 * 当前登录用户上下文（ThreadLocal）
 */
public class UserContext {

    private static final ThreadLocal<JwtUtil.LoginUser> HOLDER = new ThreadLocal<>();

    public static void set(JwtUtil.LoginUser user) {
        HOLDER.set(user);
    }

    public static JwtUtil.LoginUser get() {
        return HOLDER.get();
    }

    /** 获取当前用户ID，未登录抛出 401 */
    public static Long userId() {
        JwtUtil.LoginUser user = HOLDER.get();
        if (user == null) {
            throw BizException.unauthorized("未登录或登录已过期");
        }
        return user.getUserId();
    }

    public static String role() {
        JwtUtil.LoginUser user = HOLDER.get();
        return user == null ? null : user.getRole();
    }

    public static boolean isAdmin() {
        return "ADMIN".equals(role());
    }

    public static void clear() {
        HOLDER.remove();
    }
}
