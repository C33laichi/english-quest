package com.cc.englishquest.common;

import lombok.Getter;

/**
 * 业务异常
 */
@Getter
public class BizException extends RuntimeException {

    private final Integer code;

    public BizException(String message) {
        super(message);
        this.code = 500;
    }

    public BizException(Integer code, String message) {
        super(message);
        this.code = code;
    }

    /** 未登录 */
    public static BizException unauthorized(String msg) {
        return new BizException(401, msg);
    }

    /** 无权限 */
    public static BizException forbidden(String msg) {
        return new BizException(403, msg);
    }

    /** 参数错误 */
    public static BizException badRequest(String msg) {
        return new BizException(400, msg);
    }
}
