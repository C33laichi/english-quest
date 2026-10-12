package com.cc.englishquest.config;

import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.entity.User;
import com.cc.englishquest.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 数据初始化：确保存在管理员账号与演示学生账号
 * （密码使用 BCrypt 在运行时生成，避免脚本中硬编码哈希）
 *
 * <p>初始密码可由环境变量覆盖，仓库中不保留真实密码：
 * APP_ADMIN_PASSWORD / APP_STUDENT_PASSWORD。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DataInitRunner implements ApplicationRunner {

    private final UserMapper userMapper;

    @Value("${app.init.student-password:}")
    private String studentPassword;

    @Value("${app.init.admin-password:}")
    private String adminPassword;

    @Override
    public void run(ApplicationArguments args) {
        createIfAbsent("admin", adminPassword, "系统管理员", "ADMIN");
        createIfAbsent("student", studentPassword, "演示学生", "STUDENT");
    }

    private void createIfAbsent(String username, String rawPassword, String nickname, String role) {
        Long count = userMapper.selectCount(new LambdaQueryWrapper<User>().eq(User::getUsername, username));
        if (count != null && count > 0) {
            return;
        }
        User user = new User();
        user.setUsername(username);
        user.setPassword(BCrypt.hashpw(rawPassword));
        user.setNickname(nickname);
        user.setRole(role);
        user.setTotalPoints(0);
        user.setStreakDays(0);
        user.setStatus(1);
        user.setCreateTime(LocalDateTime.now());
        userMapper.insert(user);
        log.info("初始化账号：{} / {} （{}）", username, rawPassword, role);
    }
}
