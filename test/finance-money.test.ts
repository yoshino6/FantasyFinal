import test from 'node:test';
import assert from 'node:assert/strict';
import { copperText, parseFinanceCopper, reservedInterestCopper } from '../src/game/finance-money';

test('钱庄输入只接受整数铜币，最小为 1 铜币', () => {
  assert.equal(parseFinanceCopper('1'), 1);
  assert.equal(parseFinanceCopper('100'), 100);
  assert.equal(parseFinanceCopper('99999999'), 99_999_999);
  for (const input of ['0', '1.5', '0.01', '-1', '1e2', '01', '100000000', '', '１']) {
    assert.throws(() => parseFinanceCopper(input), /整数铜币/, input);
  }
});

test('展示只使用整数银币与整数铜币，不输出小数银币', () => {
  assert.equal(copperText(0), '0 铜币');
  assert.equal(copperText(1), '1 铜币');
  assert.equal(copperText(100), '1 银币');
  assert.equal(copperText(125), '1 银币 25 铜币');
  assert.throws(() => copperText(1.5), /铜币金额无效/);
});

test('定存利息按铜币向下取整，且不能超过利息池', () => {
  assert.equal(reservedInterestCopper(100, 20, 100), 0);
  assert.equal(reservedInterestCopper(501, 100, 100), 5);
  assert.equal(reservedInterestCopper(2001, 400, 100), 80);
  assert.equal(reservedInterestCopper(2001, 400, 3), 3);
  assert.throws(() => reservedInterestCopper(2001.5, 400, 100), /利息计算参数无效/);
});
