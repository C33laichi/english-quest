package com.cc.englishquest.service;

import cn.hutool.core.bean.BeanUtil;
import cn.hutool.crypto.digest.BCrypt;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cc.englishquest.common.BizException;
import com.cc.englishquest.common.PointType;
import com.cc.englishquest.dto.LoginDTO;
import com.cc.englishquest.dto.PasswordDTO;
import com.cc.englishquest.dto.RegisterDTO;
import com.cc.englishquest.entity.User;
import com.cc.englishquest.mapper.UserMapper;
import com.cc.englishquest.util.JwtUtil;
import com.cc.englishquest.util.UserContext;
import com.cc.englishquest.vo.LoginVO;
import com.cc.englishquest.vo.UserVO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 认证服务：注册、登录、个人信息
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserMapper userMapper;
    private final JwtUtil jwtUtil;
    private final PointService pointService;

    /** 注册 */
    @Transactional(rollbackFor = Exception.class)
    public UserVO register(RegisterDTO dto) {
        Long exists = userMapper.selectCount(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, dto.getUsername()));
        if (exists != null && exists > 0) {
            throw BizException.badRequest("该用户名已被注册");
        }
        User user = new User();
        user.setUsername(dto.getUsername());
        user.setPassword(BCrypt.hashpw(dto.getPassword()));
        user.setNickname(dto.getNickname() == null || dto.getNickname().isBlank()
                ? dto.getUsername() : dto.getNickname());
        user.setRole("STUDENT");
        user.setTotalPoints(0);
        user.setStreakDays(0);
        user.setStatus(1);
        user.setCreateTime(LocalDateTime.now());
        userMapper.insert(user);

        UserVO vo = new UserVO();
        BeanUtil.copyProperties(user, vo);
        log.info("新用户注册成功: {}", user.getUsername());
        return vo;
    }

    /** 登录 */
    @Transactional(rollbackFor = Exception.class)
    public LoginVO login(LoginDTO dto) {
        User user = userMapper.selectOne(new LambdaQueryWrapper<User>()
                .eq(User::getUsername, dto.getUsername()));
        if (user == null || !BCrypt.checkpw(dto.getPassword(), user.getPassword())) {
            // 不区分“用户不存在”与“密码错误”，避免账号枚举
            throw BizException.badRequest("用户名或密码错误");
        }
        if (user.getStatus() != null && user.getStatus() == 0) {
            throw BizException.forbidden("账号已被禁用，请联系管理员");
        }

        // 每日首次登录奖励
        String bizId = "login-" + LocalDate.now();
        int gain = pointService.addPoints(user.getId(), pointService.getLoginPoint(),
                PointType.LOGIN, bizId, "每日首次登录");

        User latest = userMapper.selectById(user.getId());
        LoginVO vo = new LoginVO();
        vo.setToken(jwtUtil.createToken(user.getId(), user.getUsername(), user.getRole()));
        vo.setUserId(latest.getId());
        vo.setUsername(latest.getUsername());
        vo.setNickname(latest.getNickname());
        vo.setRole(latest.getRole());
        vo.setAvatar(latest.getAvatar());
        vo.setTotalPoints(latest.getTotalPoints());
        vo.setStreakDays(latest.getStreakDays());
        log.info("用户 {} 登录成功，首登奖励 {} 分", user.getUsername(), gain);
        return vo;
    }

    /** 当前用户信息 */
    public UserVO currentUser() {
        User user = userMapper.selectById(UserContext.userId());
        if (user == null) {
            throw BizException.unauthorized("用户不存在");
        }
        UserVO vo = new UserVO();
        BeanUtil.copyProperties(user, vo);
        return vo;
    }

    /** 修改个人信息 */
    @Transactional(rollbackFor = Exception.class)
    public UserVO updateProfile(String nickname, String avatar) {
        User user = userMapper.selectById(UserContext.userId());
        if (nickname != null && !nickname.isBlank()) {
            user.setNickname(nickname);
        }
        if (avatar != null) {
            user.setAvatar(avatar);
        }
        userMapper.updateById(user);
        UserVO vo = new UserVO();
        BeanUtil.copyProperties(user, vo);
        return vo;
    }

    /** 修改密码 */
    @Transactional(rollbackFor = Exception.class)
    public void updatePassword(PasswordDTO dto) {
        User user = userMapper.selectById(UserContext.userId());
        if (!BCrypt.checkpw(dto.getOldPassword(), user.getPassword())) {
            throw BizException.badRequest("原密码不正确");
        }
        user.setPassword(BCrypt.hashpw(dto.getNewPassword()));
        userMapper.updateById(user);
    }
}
