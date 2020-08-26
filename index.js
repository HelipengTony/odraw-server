const express = require('express');
const fileUpload = require('express-fileupload');
const excelToJson = require('convert-excel-to-json');
const path = require("path");
const app = express();
var cors = require('cors')
const port = 3344;
const nanoid = require('nanoid').nanoid;
const mongoose = require('mongoose');
const expressJwt = require('express-jwt')
const jwt = require('jsonwebtoken')

// 依赖函数
const unique = require("./utils/unique");
const draw = require("./utils/draw");
const encrypt = require("./utils/hmac");

/* 配置 MongoDB 连接 */
// Schemas
const recordSchema = require("./schema/records");
const cateSchema = require("./schema/cates");
const userSchema = require("./schema/users");
// Mongoose 链接配置
const mongooseOptions = {
	useNewUrlParser: true,
	useUnifiedTopology: true,
	useFindAndModify: false,
	user: 'odrawUser',
	pass: 'odrawUserPwd'
}
// 项目 Schema
var recordsSchema = mongoose.Schema(recordSchema);
// 项目模型
var Record = mongoose.model('records', recordsSchema);
// 项目分类 Schema
var catesSchema = mongoose.Schema(cateSchema);
// 项目分类模型
var Cate = mongoose.model('cates', catesSchema);
// 用户 Schema
var usersSchema = mongoose.Schema(userSchema);
// 用户模型
var User = mongoose.model('users', usersSchema);


/* 配置 Express 中间件 */
// 处理文件上传
app.use(fileUpload());
// 处理跨域
app.use(cors())
// 处理 POST 数据接受
app.use(express.urlencoded({
	extended: true
}));
// JWT 密匙
const JwtSecret = 'xvk1%W532z1S7K/*';
// 配置 JWT
app.use(expressJwt({
	secret: JwtSecret,
	algorithms: ['HS256']
}).unless({
	path: ['/userLogin']
}));
// JWT 验证失败拦截器
app.use(function (err, req, res, next) {
	if (err.name === 'UnauthorizedError') {
		res.status(401).send('invalid token')
	}
})


/* 
	上传 Excel 表并保存至项目数据库(数据于 data 工作表)
	@param {file} recordsExcel
*/
app.post('/uploadRecords', function (req, res) {
	if (mongoose.connection) {
		mongoose.connection.close();
	}
	// 判断是否为管理员账户
	if (!req.user.admin) {
		return res.sendStatus(401)
	}
	mongoose.connect('mongodb://127.0.0.1/odraw', mongooseOptions);
	const db = mongoose.connection;
	// 连接数据库错误
	db.on('error', function () {
		res.status(500).send({
			code: 101,
			msg: 'Error connecting to database'
		})
	});
	// 已连接数据库
	db.once('open', function () {
		if (!req.files || Object.keys(req.files).length === 0) {
			return res.status(400).send('No files were uploaded.');
		}

		// 获取文件
		let file = req.files.recordsExcel;
		let filePath = path.dirname(__filename) + '/files/' + file.name;

		// 保存文件
		file.mv(path.dirname(__filename) + '/files/' + file.name, async function (err) {
			if (err) {
				// 发送错误提示
				return res.status(500).send(err);
			} else {
				try {
					// 转换 Excel 表为 Json
					const jsonResult = excelToJson({
						sourceFile: filePath,
						header: {
							rows: 2
						},
						columnToKey: {
							A: 'ID',
							B: 'schoolType',
							C: 'schoolName',
							D: 'projectName',
							E: 'projectCate'
						},
						sheets: ['data']
					});

					// 创建分类集合数组
					var combineArray = [];

					// 保存项目数据至数据库
					await Promise.all(jsonResult["data"].map(async (item) => {
						try {
							await Record.findOne()
								.where('projectName', item.projectName)
								.where('schoolType', item.schoolType)
								.where('projectCate', item.projectCate)
								.then(async existItem => {
									console.log(!existItem);
									if (!existItem) {
										// 处理 ID
										item.ID = nanoid()
										// 创建 Record
										let record = new Record(item);
										await record.save();
										// 添加当前到集合分类数组
										combineArray.push(item.projectCate + '||||||||||' + item.schoolType);
									}
								})
						} catch (err) {
							return new Error(err);
						}
					}))

					// 分类集合数组查重
					combineArray = unique(combineArray);
					// 保存分类数据至数据库
					await Promise.all(combineArray.map(async (item) => {
						try {
							const name = item.split("||||||||||")[0];
							const type = item.split("||||||||||")[1];
							await Cate.findOne()
								.where('cateName', name)
								.where('cateType', type)
								.then(async existItem => {
									console.log(!existItem);
									if (!existItem) {
										// 创建 Record
										let cate = new Cate({
											ID: nanoid(),
											cateName: name,
											cateType: type
										});
										await cate.save();
									}
								})
						} catch (err) {
							return new Error(err);
						}
					}))

					// 发送最终结果
					res.status(200).end('Records Data Saved');
				} catch (err) {
					res.status(500).end(err);
				}
			}
		});
	});
});


/* 
	上传 Excel 表并保存至用户数据库(数据于 data 工作表)
	@param {file} usersExcel
*/
app.post('/uploadUsers', function (req, res) {
	if (mongoose.connection) {
		mongoose.connection.close();
	}
	// 判断是否为管理员账户
	if (!req.user.admin) {
		return res.sendStatus(401)
	}
	mongoose.connect('mongodb://127.0.0.1/odraw', mongooseOptions);
	const db = mongoose.connection;
	// 连接数据库错误
	db.on('error', function () {
		res.status(500).send({
			code: 101,
			msg: 'Error connecting to database'
		})
	});
	// 已连接数据库
	db.once('open', function () {
		if (!req.files || Object.keys(req.files).length === 0) {
			return res.status(400).send('No files were uploaded.');
		}

		// 获取文件
		let file = req.files.usersExcel;
		let filePath = path.dirname(__filename) + '/files/' + file.name;

		// 保存文件
		file.mv(path.dirname(__filename) + '/files/' + file.name, async function (err) {
			if (err) {
				// 发送错误提示
				return res.status(500).send(err);
			} else {
				try {
					// 转换 Excel 表为 Json
					const jsonResult = excelToJson({
						sourceFile: filePath,
						columnToKey: {
							A: 'userName',
							B: 'userPwd',
						},
						sheets: ['data']
					});

					// 保存项目数据至数据库
					await Promise.all(jsonResult["data"].map(async (item) => {
						try {
							await User.findOne()
								.where('userName', item.userName)
								.then(async existItem => {
									console.log(!existItem);
									if (!existItem) {
										// 创建 User
										let user = new User({
											ID: nanoid(),
											userName: item.userName,
											userPwd: encrypt(encrypt(item.userPwd.toString(), item.userName) + encrypt(item.userPwd.toString(), item.userName), item.userName)
										});
										await user.save();
									}
								})
						} catch (err) {
							return new Error(err);
						}
					}))

					// 发送最终结果
					res.status(200).end('User Data Saved');
				} catch (err) {
					res.status(500).end(err);
				}
			}
		});
	});
});

/* 
	通过用户名和密码登录
	@param {string} username
	@param {string} password
*/
app.post('/userLogin', function (req, res) {
	if (mongoose.connection) {
		mongoose.connection.close();
	}
	mongoose.connect('mongodb://127.0.0.1/odraw', mongooseOptions);
	const db = mongoose.connection;
	// 连接数据库错误
	db.on('error', function () {
		res.status(500).send({
			code: 101,
			msg: 'Error connecting to database'
		})
	});
	// 已连接数据库
	db.once('open', async function () {
		if (req.body.username && req.body.password) {
			const name = req.body.username.toString();
			const pwd = req.body.password.toString();
			try {
				// 按照密码和用户名获取一名用户
				const aUser = await User.findOne()
					.where('userName', name)
					.where('userPwd', encrypt(encrypt(pwd, name) + encrypt(pwd, name), name));
				// 存在当前用户
				if (aUser !== null) {
					// 为当前用户生成 JWT Token
					const JwtToken = 'Bearer ' + jwt.sign({
							_id: aUser._id,
							name: aUser.userName,
							admin: aUser.userName === 'odrawAdmin'
						},
						JwtSecret, {
							expiresIn: 3600 * 24 * 1
						}
					);
					res.status(200).send({
						code: 104,
						msg: "successfully logged in",
						token: JwtToken,
						name: aUser.userName
					})
				} else {
					// 不存在当前用户
					res.status(400).send({
						code: 102,
						msg: "invalid password or username"
					})
				}
			} catch (err) {
				res.status(500).send({
					code: 103,
					msg: "server error"
				})
			}
		} else {
			res.status(400).send({
				code: 102,
				msg: "invalid params"
			})
		}
	});
});


/* 
	通过项目分类执行项目抽签
	@param {string} name
	@param {string} type
*/
app.post('/drawRecordsByCate', function (req, res) {
	if (mongoose.connection) {
		mongoose.connection.close();
	}
	// 判断是否为管理员账户
	if (!req.user.admin) {
		return res.sendStatus(401)
	}
	mongoose.connect('mongodb://127.0.0.1/odraw', mongooseOptions);
	const db = mongoose.connection;
	// 连接数据库错误
	db.on('error', function () {
		res.status(500).send({
			code: 101,
			msg: 'Error connecting to database'
		})
	});
	// 已连接数据库
	db.once('open', async function () {
		if (req.body.type && req.body.name) {
			try {
				// 获取全部当前分类参与项目
				const records = await Record.find()
					.where('projectCate', req.body.name)
					.where('schoolType', req.body.type);
				// 获取一个长度为当前分类项目总数内容为 1 到 当前分类项目总数 的数组(A)
				let drawNumberArray = draw.drawNumberArray(records.length);
				// 遍历当前分类全部项目
				await Promise.all(records.map(async item => {
					// 数组(A)长度范围内生成一个随机整数
					let randIndex = Math.floor((draw.randomNumber() * drawNumberArray.length));
					// 获取数组(A)中下标为当前随机整数的值
					let drawNumber = drawNumberArray[randIndex];
					// 删除该值
					drawNumberArray.splice(randIndex, 1);
					// 更新当前项目 drawNumber 字段
					await Record.findByIdAndUpdate(item._id, {
						drawNumber: drawNumber
					})
				}))
				// 完成抽签
				res.status(200).send({
					code: 104,
					msg: "successfully drew"
				})
			} catch (err) {
				res.status(500).send({
					code: 103,
					msg: "server error"
				})
			}
		} else {
			res.status(400).send({
				code: 102,
				msg: "invalid params"
			})
		}
	});
});

/* 
	通过项目分类获得项目
	@param {string} name
	@param {string} type
*/
app.get('/getRecordsByCate', function (req, res) {
	if (mongoose.connection) {
		mongoose.connection.close();
	}
	mongoose.connect('mongodb://127.0.0.1/odraw', mongooseOptions);
	const db = mongoose.connection;
	// 连接数据库错误
	db.on('error', function () {
		res.status(500).send({
			code: 101,
			msg: 'Error connecting to database'
		})
	});
	// 已连接数据库
	db.once('open', async function () {
		if (req.query.type && req.query.name) {
			try {
				// 获取全部当前分类参与项目
				const records = await Record.find()
					.where('projectCate', req.query.name)
					.where('schoolType', req.query.type)
					.select('-_id -__v')
					.sort('drawNumber')
				res.status(200).send({
					code: 105,
					msg: "successfully queried",
					data: records
				})
			} catch (err) {
				res.status(500).send({
					code: 106,
					msg: "server error"
				})
			}
		} else {
			res.status(400).send({
				code: 107,
				msg: "invalid params"
			})
		}
	});
});

/*
	通过学校名称和类型获得项目
	@param {string} name
	@param {string} type
*/
app.get('/getRecordsBySchool', function (req, res) {
	if (mongoose.connection) {
		mongoose.connection.close();
	}
	// 当前学校用户仅可获取本校的数据
	if (!req.user._id || (req.user.name !== req.query.name)) {
		return res.sendStatus(401)
	}
	mongoose.connect('mongodb://127.0.0.1/odraw', mongooseOptions);
	const db = mongoose.connection;
	// 连接数据库错误
	db.on('error', function () {
		res.status(500).send({
			code: 101,
			msg: 'Error connecting to database'
		})
	});
	// 已连接数据库
	db.once('open', async function () {
		if (req.query.type && req.query.name) {
			try {
				// 获取全部当前分类参与项目
				const records = await Record.find()
					.where('schoolName', req.query.name)
					.where('schoolType', req.query.type)
					.select('-_id -__v')
				res.status(200).send({
					code: 105,
					msg: "successfully queried",
					records: records
				})
			} catch (err) {
				res.status(500).send({
					code: 106,
					msg: "server error"
				})
			}
		} else {
			res.status(400).send({
				code: 107,
				msg: "invalid params"
			})
		}
	});
});


/*
	通过用户名和密码修改密码
	@param {string} username
	@param {string} password
	@param {string} newPassword
*/
app.post('/userModify', function (req, res) {
	if (mongoose.connection) {
		mongoose.connection.close();
	}
	// 当前用户仅可修改自身数据
	console.log('body', req.body.username);
	console.log('user', req.user.name);
	if ((!req.user._id || (req.user.name !== req.body.username)) && !req.user.admin) {
		return res.sendStatus(401)
	}
	mongoose.connect('mongodb://127.0.0.1/odraw', mongooseOptions);
	const db = mongoose.connection;
	// 连接数据库错误
	db.on('error', function () {
		res.status(500).send({
			code: 101,
			msg: 'Error connecting to database'
		})
	});
	// 已连接数据库
	db.once('open', async function () {
		if (req.body.username && req.body.password && req.body.newPassword) {
			const name = req.body.username.toString();
			const pwd = req.body.password.toString();
			const newPwd = req.body.newPassword.toString();
			try {
				// 按照密码和用户名获取一名用户
				let aUser = await User.findOne()
					.where('userName', name)
					.where('userPwd', encrypt(encrypt(pwd, name) + encrypt(pwd, name), name));
				// 存在当前用户或当前用户为管理员
				if (aUser !== null || req.user.admin) {
					// 当前用户为管理员可直接修改密码
					if (req.user.admin) {
						aUser = await User.findOne()
							.where('userName', name);
					}
					// 更新当前用户密码
					await User.findByIdAndUpdate(aUser._id, {
						userPwd: encrypt(encrypt(newPwd, name) + encrypt(newPwd, name), name)
					})
					res.status(200).send({
						code: 104,
						msg: "successfully changed password",
					})
				} else {
					// 不存在当前用户
					res.status(400).send({
						code: 102,
						msg: "invalid password or username"
					})
				}
			} catch (err) {
				res.status(500).send({
					code: 103,
					msg: "server error"
				})
			}
		} else {
			res.status(400).send({
				code: 102,
				msg: "invalid params"
			})
		}
	});
});


app.listen(port, () => console.log(`Example app listening on port ${port}!`))