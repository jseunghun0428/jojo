
int FUN_0041b51e(uint *param_1,uint param_2,undefined1 *param_3)

{
  bool bVar1;
  undefined3 extraout_var;
  uint uVar2;
  undefined4 local_118 [65];
  int local_14;
  void *local_10;
  undefined1 *puStack_c;
  int local_8;
  
  local_8 = -1;
  puStack_c = &LAB_00485217;
  local_10 = ExceptionList;
  local_14 = 0;
  ExceptionList = &local_10;
  FUN_004032b0(local_118);
  local_8 = local_8 + 1;
  bVar1 = FUN_0041fb35(local_118,param_1);
  if (CONCAT31(extraout_var,bVar1) != 0) {
    uVar2 = FUN_0041fc89(local_118,param_2,param_3);
    if (uVar2 != 0) {
      local_14 = local_14 + 1;
    }
  }
  local_8 = local_8 + -1;
  FUN_004192c5(local_118);
  ExceptionList = local_10;
  return local_14;
}

