// 在单进程里跑全部测试文件。
// 原因：DSH 的文件沙箱下 `node --test test/` 会为每个文件 spawn 子进程，stdio 管道被拒（EPERM）。
// 单进程运行器功能一致，还能少一次冷启动。
import './parse.test.js';
import './weights.test.js';
import './rewrite.test.js';
import './import.test.js';
import './gate.test.js';
import './pipeline.test.js';
import './server.test.js';
