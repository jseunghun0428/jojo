
uint __thiscall FUN_004105ff(void *this,int param_1)

{
  byte bVar1;
  undefined2 uVar2;
  uint uVar3;
  undefined3 uVar4;
  int extraout_ECX;
  int extraout_ECX_00;
  int local_2c;
  int local_18;
  int local_10;
  uint local_c;
  uint local_8;
  
  local_c = 1;
  local_10 = 0;
  local_18 = 0;
  if (*(int *)((int)this + 0x14) <= param_1) {
    *(undefined4 *)((int)this + 0x14) = 0xffffffff;
    goto LAB_00410629;
  }
  local_8 = 1;
  uVar3 = local_c;
  do {
    local_c = uVar3;
    local_2c = 0;
    if (((local_8 == 6) && (local_c == 0)) || (local_8 == 1)) {
      local_2c = 1;
    }
    uVar3 = FUN_00410857(this,local_2c,param_1 + 1);
    if (uVar3 != 0) {
      if (5 < (byte)uVar3) {
        return CONCAT31((int3)(uVar3 >> 8),1);
      }
      return uVar3;
    }
    while( true ) {
      if (local_8 == 3) {
        uVar3 = FUN_00410738(param_1,local_10,(int)this,local_18);
        return uVar3;
      }
LAB_00410629:
      if (*(int *)((int)this + 0x34) != 0) {
        FUN_0040fcb2((int)this);
      }
      uVar2 = (**(code **)(*(int *)this + 0x10))();
      local_8 = (**(code **)(*(int *)this + 8))();
      if ((extraout_ECX == 0x76) && (param_1 != 0)) {
        return 0;
      }
      if (9 < local_8) {
        return 1;
      }
      bVar1 = (byte)local_8;
      if (bVar1 == 2) {
        *(undefined2 *)((int)this + 0x10) = uVar2;
        *(int *)((int)this + 0x14) = param_1;
        return local_8;
      }
      if (bVar1 == 4) break;
      if (bVar1 == 7) {
        local_18 = 1;
      }
      else if (bVar1 == 9) {
        local_10 = 1;
      }
      else {
        uVar4 = (undefined3)(local_8 >> 8);
        if (bVar1 == 8) {
          return CONCAT31(uVar4,5);
        }
        if (4 < bVar1) {
          return CONCAT31(uVar4,1);
        }
      }
    }
    local_8 = (**(code **)(*(int *)this + 8))();
    if ((extraout_ECX_00 == 0x76) && (param_1 != 0)) {
      return 0;
    }
    uVar3 = local_8;
    if ((1 < (int)local_8) && (uVar3 = local_c, local_8 == 5)) {
      return 1;
    }
  } while( true );
}

