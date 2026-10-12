package com.cc.englishquest.config;

import com.cc.englishquest.common.BizException;
import com.cc.englishquest.util.JwtUtil;
import com.cc.englishquest.util.UserContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

/**
 * 登录鉴权拦截器：校验 Token 与角色
 */
@Component
@RequiredArgsConstructor
public class AuthInterceptor implements HandlerInterceptor {

    private final JwtUtil jwtUtil;

    /** 免登录白名单 */
    private static final String[] WHITE_LIST = {
            "/api/auth/login", "/api/auth/register", "/error"
    };

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        String uri = request.getRequestURI();

        for (String white : WHITE_LIST) {
            if (uri.equals(white)) {
                return true;
            }
        }

        // OPTIONS 预检放行
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }

        String token = request.getHeader("Authorization");
        JwtUtil.LoginUser user = jwtUtil.parse(token);
        UserContext.set(user);

        // 后台管理接口需要 ADMIN 角色
        if (uri.startsWith("/api/admin") && !"ADMIN".equals(user.getRole())) {
            throw BizException.forbidden("无权限访问该功能");
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        UserContext.clear();
    }
}
