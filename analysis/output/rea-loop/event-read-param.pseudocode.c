
undefined8 FUN_00426e64(int param_1)

{
  byte bVar1;
  int iVar2;
  int iVar3;
  int local_18;
  int local_14;
  int local_10;
  int local_c;
  int local_8;
  
  local_8 = 0;
  local_c = 0;
  local_10 = 0;
  local_14 = 0;
  while( true ) {
    iVar3 = local_8 + local_10 + local_14;
    bVar1 = *(byte *)(param_1 + iVar3);
    if (0x39 < bVar1) break;
    if (bVar1 < 0x30) {
      if (bVar1 == 0x2d) {
        if (local_8 != 0) break;
        local_10 = local_10 + 1;
      }
      else {
        if ((bVar1 != 0x2a) || (local_8 != 0)) break;
        local_14 = local_14 + 1;
      }
    }
    else {
      local_8 = local_8 + 1;
    }
  }
  if (local_8 == 0) {
    local_c = 0;
  }
  else {
    local_8 = local_8 + -1;
    local_18 = local_8;
    while( true ) {
      iVar3 = *(byte *)(param_1 + local_10 + local_14 + local_18) - 0x30;
      for (iVar2 = local_8 - local_18; iVar2 != 0; iVar2 = iVar2 + -1) {
        iVar3 = iVar3 * 10;
      }
      local_c = local_c + iVar3;
      if (local_18 == 0) break;
      local_18 = local_18 + -1;
    }
    if (local_14 != 0) {
      local_c = *(int *)(&DAT_00502000 + local_c * 4);
    }
    if (local_10 != 0) {
      local_c = -local_c;
    }
    iVar3 = local_10 + local_14 + local_8 + 1;
  }
  return CONCAT44(iVar3,local_c);
}

