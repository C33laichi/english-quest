package com.cc.englishquest.common;

import lombok.extern.slf4j.Slf4j;
import org.springframework.validation.BindException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * 全局异常处理
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BizException.class)
    public Result<Void> handleBiz(BizException e) {
        log.warn("业务异常: {}", e.getMessage());
        return Result.error(e.getCode(), e.getMessage());
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, BindException.class})
    public Result<Void> handleValid(Exception e) {
        String msg = "参数校验失败";
        if (e instanceof MethodArgumentNotValidException ex && ex.getBindingResult().getFieldError() != null) {
            msg = ex.getBindingResult().getFieldError().getDefaultMessage();
        } else if (e instanceof BindException ex && ex.getBindingResult().getFieldError() != null) {
            msg = ex.getBindingResult().getFieldError().getDefaultMessage();
        }
        return Result.error(400, msg);
    }

    /**
     * 上传文件超过 spring.servlet.multipart 的上限。
     *
     * <p>必须单独接住：它是 {@link Exception} 的子类，不写这一条就会落到下面的兜底分支，
     * 管理员看到的只有「系统繁忙，请稍后重试」，完全猜不到是文件太大。</p>
     */
    @ExceptionHandler(MaxUploadSizeExceededException.class)
    public Result<Void> handleUploadSize(MaxUploadSizeExceededException e) {
        log.warn("上传文件过大: {}", e.getMessage());
        return Result.error(400, "文件超出大小限制（单个文件最大 5MB），请拆分后分批导入");
    }

    /**
     * 少传了必填的请求参数（例如批量导入漏了 levelId）。
     *
     * <p>和上传超限同理：不单独接住就会落到兜底分支，前端只能显示「系统繁忙」，
     * 而实际上这是一个请求方自己就能修好的问题，必须回 400 并点名是哪个参数。</p>
     */
    @ExceptionHandler(MissingServletRequestParameterException.class)
    public Result<Void> handleMissingParam(MissingServletRequestParameterException e) {
        log.warn("缺少必需的请求参数: {}", e.getParameterName());
        return Result.error(400, "缺少必需的参数「" + e.getParameterName() + "」，请检查请求是否完整");
    }

    /** 参数类型不对（例如 levelId 传了非数字） */
    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public Result<Void> handleTypeMismatch(MethodArgumentTypeMismatchException e) {
        log.warn("请求参数类型不正确: {}={}", e.getName(), e.getValue());
        return Result.error(400, "参数「" + e.getName() + "」格式不正确，请检查后重试");
    }

    @ExceptionHandler(Exception.class)
    public Result<Void> handleOther(Exception e) {
        log.error("系统异常", e);
        return Result.error(500, "系统繁忙，请稍后重试");
    }
}
