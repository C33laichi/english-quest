package com.cc.englishquest.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 用户
 */
@Data
@TableName("t_user")
public class User implements Serializable {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String username;

    private String password;

    private String nickname;

    /** STUDENT / ADMIN */
    private String role;

    private String avatar;

    private Integer totalPoints;

    private Integer streakDays;

    private LocalDate lastStudyDate;

    /** 1 正常 0 禁用 */
    private Integer status;

    private LocalDateTime createTime;
}
