package com.cc.englishquest.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 后台新增用户（任务书「用户数据的添加」+ 管理员账号的注册入口）
 *
 * <p>与面向学生的 {@link RegisterDTO} 分开：公开注册接口只允许注册学生，
 * 管理员账号只能由已登录的管理员在后台创建，避免开放自助注册管理员。</p>
 */
@Data
public class AdminUserDTO {

    @NotBlank(message = "用户名不能为空")
    @Size(min = 3, max = 20, message = "用户名长度需为 3~20 位")
    private String username;

    @NotBlank(message = "密码不能为空")
    @Size(min = 6, max = 20, message = "密码长度需为 6~20 位")
    private String password;

    private String nickname;

    /** STUDENT / ADMIN，缺省为 STUDENT */
    private String role;
}
