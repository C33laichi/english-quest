package com.cc.englishquest.common;

import lombok.Data;

import java.io.Serializable;

/**
 * 统一响应体
 */
@Data
public class Result<T> implements Serializable {

    private Integer code;
    private String msg;
    private T data;

    public static <T> Result<T> success() {
        return build(200, "success", null);
    }

    public static <T> Result<T> success(T data) {
        return build(200, "success", data);
    }

    public static <T> Result<T> success(String msg, T data) {
        return build(200, msg, data);
    }

    public static <T> Result<T> error(String msg) {
        return build(500, msg, null);
    }

    public static <T> Result<T> error(Integer code, String msg) {
        return build(code, msg, null);
    }

    private static <T> Result<T> build(Integer code, String msg, T data) {
        Result<T> r = new Result<>();
        r.setCode(code);
        r.setMsg(msg);
        r.setData(data);
        return r;
    }
}
