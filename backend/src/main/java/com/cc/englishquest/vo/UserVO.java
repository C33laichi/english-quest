package com.cc.englishquest.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 用户信息视图
 */
@Data
public class UserVO {

    private Long id;

    private String username;

    private String nickname;

    private String role;

    private String avatar;

    private Integer totalPoints;

    private Integer streakDays;

    private LocalDate lastStudyDate;

    private Integer status;

    private LocalDateTime createTime;
}
