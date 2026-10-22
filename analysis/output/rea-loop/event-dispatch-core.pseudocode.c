
uint FUN_0041811f(undefined4 *param_1)

{
  uint uVar1;
  
  uVar1 = FUN_00410857(param_1,1,0);
  if (uVar1 == 4) {
    DAT_004b0776 = DAT_004b0776 + 1;
    FUN_00417eea();
    (**(code **)*param_1)();
    FUN_00417e84(param_1);
    FUN_00417e95(param_1);
  }
  return uVar1;
}

