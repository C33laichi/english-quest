package com.cc.englishquest.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.cc.englishquest.entity.User;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface UserMapper extends BaseMapper<User> {
}
